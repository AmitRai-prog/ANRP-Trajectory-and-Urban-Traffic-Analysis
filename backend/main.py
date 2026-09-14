"""
main.py — FastAPI backend for the FlytBase Drone Traffic Analytics app.

Endpoints:
    POST /api/upload          Upload a video file → returns job_id
    GET  /api/status/{id}     SSE stream of tracking progress
    GET  /api/results/{id}    Tracking results (JSON)
    GET  /api/video/{id}      Serve annotated video
    GET  /api/download/{id}   Download tracks.parquet
"""

from __future__ import annotations

import asyncio
import json
import shutil
import uuid
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from config import UPLOAD_DIR, OUTPUT_DIR
from tracker import run_tracking
from analytics import class_summary, track_summaries, speed_estimate_px, overview_stats
from database import (
    init_db,
    get_all_cameras,
    upsert_camera,
    get_all_incidents,
    get_incident_by_id,
    save_incident,
    get_global_vehicle_details,
)
from anomaly.scoring import build_incidents_from_tracking
from investigation import run_incident_investigation
from cameras.manager import CameraManager, Camera
from cctv.pipeline import run_independent_cctv_pipeline

# Initialize SQLite database schema and seed default cameras
init_db()

app = FastAPI(title="FlytBase Drone Traffic Analytics & Multi-Camera Incident Platform")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store
jobs: dict[str, dict] = {}
cctv_jobs: dict[str, dict] = {}


def _save_job_meta(job_id: str):
    job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        return
    out_dir = Path(job["out_dir"])
    meta = {
        "job_id": job_id,
        "filename": job["filename"],
        "status": job["status"],
        "video_path": job["video_path"],
        "out_dir": job["out_dir"],
        "result": job["result"],
    }
    try:
        with open(out_dir / "meta.json", "w") as f:
            json.dump(meta, f, indent=2)
    except Exception as e:
        print(f"[WARN] Failed to write meta.json: {e}")


def _save_cctv_job_meta(job_id: str):
    job = cctv_jobs.get(job_id)
    if not job or job.get("status") != "done":
        return
    out_dir = Path(job["out_dir"])
    meta = {
        "job_id": job_id,
        "filename": job["filename"],
        "status": job["status"],
        "video_path": job["video_path"],
        "out_dir": job["out_dir"],
        "result": job["result"],
    }
    try:
        with open(out_dir / "meta.json", "w") as f:
            json.dump(meta, f, indent=2)
    except Exception as e:
        print(f"[WARN] Failed to write cctv meta.json: {e}")


def _load_existing_cctv_jobs():
    cctv_dir = OUTPUT_DIR / "cctv_jobs"
    if not cctv_dir.exists():
        return
    for job_dir in cctv_dir.iterdir():
        if not job_dir.is_dir():
            continue
        meta_file = job_dir / "meta.json"
        if meta_file.exists():
            try:
                with open(meta_file) as f:
                    data = json.load(f)
                    jid = data.get("job_id", job_dir.name)
                    cctv_jobs[jid] = {
                        "status": data.get("status", "done"),
                        "video_path": data.get("video_path", ""),
                        "out_dir": str(job_dir),
                        "filename": data.get("filename", "CCTV Video"),
                        "progress": [],
                        "result": data.get("result"),
                        "error": None,
                    }
            except Exception as e:
                print(f"[WARN] Failed to load cctv meta.json for {job_dir.name}: {e}")


def _load_existing_jobs():
    if not OUTPUT_DIR.exists():
        return
    for job_dir in OUTPUT_DIR.iterdir():
        if not job_dir.is_dir():
            continue
        meta_file = job_dir / "meta.json"
        if meta_file.exists():
            try:
                with open(meta_file) as f:
                    data = json.load(f)
                    jid = data.get("job_id", job_dir.name)
                    jobs[jid] = {
                        "status": data.get("status", "done"),
                        "video_path": data.get("video_path", ""),
                        "out_dir": str(job_dir),
                        "filename": data.get("filename", "Video"),
                        "progress": [],
                        "result": data.get("result"),
                        "error": None,
                    }
            except Exception as e:
                print(f"[WARN] Failed to load meta.json for {job_dir.name}: {e}")


_load_existing_jobs()
_load_existing_cctv_jobs()


@app.post("/api/aerial/analyze")
@app.post("/api/upload")
async def upload_video(video: UploadFile = File(...)):
    """Accept a video upload and start a tracking job."""
    job_id = str(uuid.uuid4())[:8]

    # Save uploaded file
    upload_dir = UPLOAD_DIR / job_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    video_path = upload_dir / video.filename

    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    out_dir = OUTPUT_DIR / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    jobs[job_id] = {
        "status": "queued",
        "video_path": str(video_path),
        "out_dir": str(out_dir),
        "filename": video.filename,
        "progress": [],
        "result": None,
        "error": None,
    }

    # Run tracking in a background thread
    asyncio.get_event_loop().run_in_executor(None, _run_job, job_id)

    return {"job_id": job_id, "filename": video.filename}


def _run_job(job_id: str):
    """Execute the tracking pipeline (runs in a thread)."""
    job = jobs[job_id]
    job["status"] = "running"
    job["incidents"] = []

    def on_progress(p: dict):
        job["progress"].append(p)

    try:
        result = run_tracking(
            video_path=Path(job["video_path"]),
            out_dir=Path(job["out_dir"]),
            stride=5,
            max_seconds=0,  # process full video
            annotate_seconds=9999,  # annotate all
            on_progress=on_progress,
        )

        # Run anomaly & incident detection on output tracks
        parquet_path = Path(result["parquet_path"])
        incidents = []
        if parquet_path.exists():
            try:
                df = pd.read_parquet(parquet_path)
                incidents = build_incidents_from_tracking(
                    df,
                    camera_id="DRONE_01",
                    location_name="Pune Junction Corridor",
                    source_fps=result.get("source_fps", 30.0),
                    stride=5,
                )
                for inc in incidents:
                    save_incident(inc)
            except Exception as ex:
                print(f"[WARN] Anomaly detection error: {ex}")

        # Distinguish significant incidents requiring CCTV vs minor/normal events
        significant_incidents = [inc for inc in incidents if inc.get("is_significant")]
        has_significant_incident = len(significant_incidents) > 0
        primary_incident = significant_incidents[0] if has_significant_incident else None

        result["incidents"] = incidents
        result["has_significant_incident"] = has_significant_incident
        result["primary_incident"] = primary_incident
        job["incidents"] = incidents
        job["has_significant_incident"] = has_significant_incident
        job["primary_incident"] = primary_incident
        job["result"] = result
        job["status"] = "done"
        _save_job_meta(job_id)
    except Exception as e:
        job["error"] = str(e)
        job["status"] = "error"


@app.get("/api/status/{job_id}")
async def job_status_sse(job_id: str):
    """Server-Sent Events stream for real-time progress and live incident alerts."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_stream():
        seen = 0
        incidents_sent = set()
        while True:
            job = jobs[job_id]
            # Send progress updates
            while seen < len(job["progress"]):
                data = json.dumps(job["progress"][seen])
                yield f"event: progress\ndata: {data}\n\n"
                seen += 1

            # Emit live incident detections if newly found
            for inc in job.get("incidents", []):
                inc_id = inc["incident_id"]
                if inc_id not in incidents_sent:
                    yield f"event: incident_detected\ndata: {json.dumps(inc)}\n\n"
                    incidents_sent.add(inc_id)

            if job["status"] == "done":
                yield f"event: done\ndata: {json.dumps(job['result'])}\n\n"
                break
            elif job["status"] == "error":
                yield f"event: error\ndata: {json.dumps({'error': job['error']})}\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/results/{job_id}")
async def get_results(job_id: str):
    """Return full tracking results with analytics and detected traffic incidents."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "done":
        return {"status": job["status"], "error": job.get("error")}

    result = job["result"]
    parquet_path = Path(result["parquet_path"])

    # Load the parquet for analytics
    df = pd.read_parquet(parquet_path)
    source_fps = result["source_fps"]
    stride = 5

    # Check / compute incidents
    incidents = job.get("incidents") or []
    if not incidents and not df.empty:
        incidents = build_incidents_from_tracking(
            df,
            camera_id="DRONE_01",
            location_name="Pune Junction Corridor",
            source_fps=source_fps,
            stride=stride,
        )
        for inc in incidents:
            save_incident(inc)
        job["incidents"] = incidents

    # Build per-track trajectory index for real-time video locking & HUD overlays
    trajectories = {}
    if not df.empty and "track_id" in df.columns:
        valid_df = df[df["track_id"] >= 0].sort_values(["track_id", "timestamp_s"])
        try:
            res_parts = str(result.get("source_resolution", "3840x2160")).split("x")
            w, h = float(res_parts[0]), float(res_parts[1])
        except Exception:
            w, h = 3840.0, 2160.0

        for tid, gdf in valid_df.groupby("track_id"):
            trajectories[int(tid)] = {
                "t": [round(float(t), 2) for t in gdf["timestamp_s"]],
                "box": [
                    [
                        round(float(r.x1) / w, 4),
                        round(float(r.y1) / h, 4),
                        round(float(r.x2) / w, 4),
                        round(float(r.y2) / h, 4),
                    ]
                    for r in gdf.itertuples()
                ],
                "speed": [
                    round(float(s), 1) if pd.notna(s) else 0.0
                    for s in (gdf["speed_kmh"] if "speed_kmh" in gdf.columns else [0] * len(gdf))
                ],
            }

    analytics = {
        "overview": overview_stats(df, source_fps, stride, result["duration_s"]),
        "class_summary": class_summary(df),
        "track_summaries": track_summaries(df, source_fps, stride)[:150],
        "speed_estimates": speed_estimate_px(df, source_fps, stride)[:50],
        "trajectories": trajectories,
        "incidents": incidents,
    }

    significant_incidents = [inc for inc in incidents if inc.get("is_significant")]
    has_significant_incident = len(significant_incidents) > 0
    primary_incident = significant_incidents[0] if has_significant_incident else None

    return {
        "status": "done",
        "job_id": job_id,
        "filename": job["filename"],
        **result,
        "incidents": incidents,
        "has_significant_incident": has_significant_incident,
        "primary_incident": primary_incident,
        "analytics": analytics,
    }


@app.get("/api/video/{job_id}")
async def serve_video(job_id: str):
    """Serve the annotated video."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail="Job not done yet")

    video_path = Path(job["result"]["video_path"])
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Annotated video not found")

    return FileResponse(
        str(video_path),
        media_type="video/mp4",
        content_disposition_type="inline",
    )


@app.get("/api/download/{job_id}")
async def download_parquet(job_id: str):
    """Download the tracks parquet file."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail="Job not done yet")

    parquet_path = Path(job["result"]["parquet_path"])
    if not parquet_path.exists():
        raise HTTPException(status_code=404, detail="Parquet file not found")

    return FileResponse(
        str(parquet_path),
        media_type="application/octet-stream",
        filename="tracks.parquet",
    )


@app.get("/api/jobs")
async def list_jobs():
    """List all jobs and their status."""
    return {
        jid: {
            "status": j["status"],
            "filename": j["filename"],
        }
        for jid, j in jobs.items()
    }


# ===========================================================================
# Multi-Camera, Incident Management & ANPR Endpoints
# ===========================================================================

@app.get("/api/cameras")
async def list_cameras():
    """List all registered Drone and CCTV cameras."""
    cameras = get_all_cameras()
    return {"cameras": cameras}


@app.post("/api/cameras")
async def register_camera_node(cam: dict):
    """Register or update a camera node."""
    if "camera_id" not in cam:
        raise HTTPException(status_code=400, detail="camera_id is required")
    upsert_camera(cam)
    return {"status": "ok", "camera_id": cam["camera_id"]}


@app.get("/api/incidents")
async def list_incidents(status: str | None = None):
    """List all detected incidents with optional status filtering."""
    incidents = get_all_incidents(status=status)
    return {"incidents": incidents}


@app.get("/api/incidents/{incident_id}")
async def get_incident(incident_id: str):
    """Retrieve detailed telemetry and status for a single incident."""
    inc = get_incident_by_id(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return inc


@app.post("/api/incidents/{incident_id}/investigate")
async def investigate_incident(incident_id: str, payload: dict = None):
    """
    Trigger end-to-end incident investigation:
    CCTV Selection → CCTV Tracking → Cross-Camera Re-ID → ANPR → Global Vehicle Identity.
    """
    target_cctv = (payload or {}).get("cctv_id") if payload else None
    cctv_file = (payload or {}).get("cctv_file_path") if payload else None
    try:
        report = run_incident_investigation(
            incident_id,
            target_cctv_id=target_cctv,
            cctv_file_path=cctv_file,
        )
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Investigation failed: {e}")


@app.post("/api/incidents/{incident_id}/upload-cctv")
async def upload_cctv_and_investigate(
    incident_id: str,
    cctv_video: UploadFile = File(...),
):
    """
    Accept incident-specific CCTV footage upload, trigger automated investigation,
    and return unified vehicle tracking, Re-ID, and ANPR results.
    """
    inc = get_incident_by_id(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    cctv_dir = UPLOAD_DIR / "cctv" / incident_id
    cctv_dir.mkdir(parents=True, exist_ok=True)
    cctv_path = cctv_dir / cctv_video.filename

    with open(cctv_path, "wb") as f:
        shutil.copyfileobj(cctv_video.file, f)

    try:
        report = run_incident_investigation(
            incident_id,
            cctv_file_path=cctv_path,
        )
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CCTV investigation failed: {e}")


@app.get("/api/vehicles/{global_vehicle_id}")
async def get_vehicle_profile(global_vehicle_id: str):
    """Fetch global unified vehicle profile and cross-camera observations."""
    veh = get_global_vehicle_details(global_vehicle_id)
    if not veh:
        raise HTTPException(status_code=404, detail="Global vehicle not found")
    return veh


@app.get("/api/vehicles/{global_vehicle_id}/trajectory")
async def get_vehicle_trajectory(global_vehicle_id: str):
    """Fetch chronological multi-camera trajectory observations for a vehicle."""
    veh = get_global_vehicle_details(global_vehicle_id)
    if not veh:
        raise HTTPException(status_code=404, detail="Global vehicle not found")
    return {
        "global_vehicle_id": global_vehicle_id,
        "vehicle_class": veh["vehicle_class"],
        "plate_text": veh.get("plate_text"),
        "observations": veh.get("observations", []),
        "anpr_records": veh.get("anpr_records", []),
    }


@app.get("/api/anpr/crop/{filename}")
async def serve_anpr_crop(filename: str):
    """Serve cropped license plate or vehicle image."""
    crop_file = OUTPUT_DIR / "anpr_crops" / filename
    if not crop_file.exists():
        raise HTTPException(status_code=404, detail="Crop not found")
    return FileResponse(str(crop_file), media_type="image/jpeg")


# ---------------------------------------------------------------------------
# Independent CCTV Number Plate Analysis Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/cctv/analyze")
@app.post("/api/cctv/upload")
async def analyze_cctv_video(video: UploadFile = File(...)):
    """
    Accept CCTV recording and start independent vehicle tracking and number plate extraction.
    Does NOT require aerial footage or any incident.
    """
    job_id = str(uuid.uuid4())[:8]

    upload_dir = UPLOAD_DIR / "cctv_jobs" / job_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    video_path = upload_dir / video.filename

    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    out_dir = OUTPUT_DIR / "cctv_jobs" / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    cctv_jobs[job_id] = {
        "status": "queued",
        "video_path": str(video_path),
        "out_dir": str(out_dir),
        "filename": video.filename,
        "progress": [],
        "result": None,
        "error": None,
    }

    asyncio.get_event_loop().run_in_executor(None, _run_cctv_job, job_id)
    return {"job_id": job_id, "filename": video.filename, "status": "queued"}


def _run_cctv_job(job_id: str):
    """Execute the independent CCTV pipeline (runs in background thread)."""
    job = cctv_jobs[job_id]
    job["status"] = "running"

    def on_progress(p: dict):
        job["progress"].append(p)

    try:
        result = run_independent_cctv_pipeline(
            video_path=Path(job["video_path"]),
            out_dir=Path(job["out_dir"]),
            max_frames=300,
            stride=2,
            on_progress=on_progress,
        )
        result["job_id"] = job_id
        job["result"] = result
        job["status"] = "done"
        _save_cctv_job_meta(job_id)
    except Exception as e:
        print(f"[ERROR] CCTV job failed: {e}")
        job["error"] = str(e)
        job["status"] = "error"


@app.get("/api/cctv/status/{job_id}")
async def cctv_job_status_sse(job_id: str):
    """Server-Sent Events stream for real-time CCTV analysis progress."""
    if job_id not in cctv_jobs:
        raise HTTPException(status_code=404, detail="CCTV Job not found")

    async def event_stream():
        seen = 0
        while True:
            job = cctv_jobs[job_id]
            while seen < len(job["progress"]):
                data = json.dumps(job["progress"][seen])
                yield f"event: progress\ndata: {data}\n\n"
                seen += 1

            if job["status"] == "done":
                yield f"event: done\ndata: {json.dumps(job['result'])}\n\n"
                break
            elif job["status"] == "error":
                yield f"event: error\ndata: {json.dumps({'error': job['error']})}\n\n"
                break

            await asyncio.sleep(0.4)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/cctv/results/{job_id}")
async def get_cctv_results(job_id: str):
    """Fetch complete CCTV vehicle and number plate extraction results."""
    if job_id not in cctv_jobs:
        raise HTTPException(status_code=404, detail="CCTV Job not found")

    job = cctv_jobs[job_id]
    if job["status"] != "done":
        return {"status": job["status"], "error": job.get("error")}

    return job["result"]


