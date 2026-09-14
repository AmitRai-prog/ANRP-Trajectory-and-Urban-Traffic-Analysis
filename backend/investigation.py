"""
investigation.py — Orchestrates the multi-camera incident investigation workflow:
Drone Incident → Relevant CCTV Selection → CCTV Tracking → Cross-Camera Re-ID → ANPR → Global Vehicle Identity.
"""

from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any

from cameras.manager import CameraManager
from cameras.selector import select_relevant_cameras
from cctv.tracker import run_cctv_tracking
from reid.vehicle_reid import match_drone_to_cctv_tracks
from anpr.pipeline import run_anpr_on_track_crops
from config import DEMO_MODE, UPLOAD_DIR
from database import (
    get_incident_by_id,
    update_incident_status,
    upsert_global_vehicle,
    add_camera_observation,
    save_anpr_result,
)


def run_incident_investigation(
    incident_id: str,
    target_cctv_id: str | None = None,
    cctv_file_path: Path | str | None = None,
) -> dict[str, Any]:
    """
    Execute full multi-camera investigation workflow for a flagged incident.
    """
    incident = get_incident_by_id(incident_id)
    if not incident:
        raise ValueError(f"Incident {incident_id} not found in database")

    update_incident_status(incident_id, "investigating")

    # 1. Fetch all registered cameras
    all_cameras = CameraManager.list_cameras()

    # 2. Rank and select relevant CCTV cameras
    drone_heading = incident.get("details", {}).get("vehicle_heading_deg", 90.0)
    candidate_cameras = select_relevant_cameras(
        incident,
        all_cameras,
        vehicle_heading_deg=drone_heading,
    )

    if not candidate_cameras:
        update_incident_status(incident_id, "open")
        return {
            "status": "error",
            "message": "No relevant CCTV cameras found within operational corridor",
            "incident": incident,
            "candidate_cameras": [],
        }

    # Use specified camera or top-ranked candidate
    if target_cctv_id:
        selected_cam_info = next((c for c in candidate_cameras if c["camera_id"] == target_cctv_id), candidate_cameras[0])
    else:
        selected_cam_info = candidate_cameras[0]

    chosen_camera = CameraManager.get_camera_by_id(selected_cam_info["camera_id"])
    if not chosen_camera:
        chosen_camera = all_cameras[1]  # Fallback to first CCTV

    # Extract primary involved drone track details before tracking
    involved = incident.get("involved_tracks", [])
    primary_drone_tid = involved[0]["track_id"] if involved else 1
    drone_time_s = float(incident.get("timestamp_s", 0.0))

    # Construct drone vehicle profile
    drone_classes = incident.get("details", {}).get("classes", ["car"])
    drone_class = drone_classes[0] if drone_classes else "car"
    drone_vehicle = {
        "track_id": primary_drone_tid,
        "class_name": drone_class,
        "timestamp_s": drone_time_s,
        "crop": None,  # Aerial crop or simulated profile
    }

    # Expected travel time from incident to CCTV based on distance
    dist_m = selected_cam_info.get("distance_m", 120.0)
    expected_travel_s = max(round(dist_m / 10.0, 1), 4.0)  # ~36 km/h travel

    # 3. Locate CCTV video stream or use user-provided video
    if cctv_file_path and Path(cctv_file_path).exists():
        from cameras.sources import FileVideoSource
        cctv_source = FileVideoSource(cctv_file_path)
    else:
        demo_cctv_path = UPLOAD_DIR / "demo_traffic.mp4"
        if not demo_cctv_path.exists():
            demo_candidates = list(UPLOAD_DIR.glob("**/*.mp4"))
            demo_cctv_path = demo_candidates[0] if demo_candidates else None
        cctv_source = CameraManager.create_video_source(chosen_camera, fallback_video_path=demo_cctv_path)

    # 4. Run CCTV Vehicle Tracking
    t0 = time.time()
    cctv_results = run_cctv_tracking(cctv_source, max_frames=120, stride=2)
    cctv_tracks = cctv_results.get("tracks", [])

    # In DEMO_MODE, if physical CCTV video has no vehicle detections, provide calibrated demo CCTV observation
    if not cctv_tracks and DEMO_MODE:
        import numpy as np
        # Synthesize a sharp vehicle crop for demo ANPR
        demo_crop = np.zeros((160, 240, 3), dtype=np.uint8)
        demo_crop[:] = (45, 55, 72)  # Metallic slate car
        cctv_tracks = [
            {
                "cctv_track_id": 43,
                "class_name": "car",
                "detections": 32,
                "duration_s": 5.8,
                "first_seen_s": round(drone_time_s + expected_travel_s, 2),
                "last_seen_s": round(drone_time_s + expected_travel_s + 5.8, 2),
                "displacement_px": 280.0,
                "heading_deg": drone_heading,
                "best_crops": [
                    {"frame_idx": 10, "timestamp_s": round(drone_time_s + expected_travel_s, 2), "crop": demo_crop, "sharpness": 185.0},
                    {"frame_idx": 15, "timestamp_s": round(drone_time_s + expected_travel_s + 0.5, 2), "crop": demo_crop, "sharpness": 210.0},
                ],
            }
        ]

    # 5. Cross-Camera Vehicle Re-Identification
    reid_result = match_drone_to_cctv_tracks(
        drone_vehicle,
        cctv_tracks,
        expected_travel_s=expected_travel_s,
        drone_heading_deg=drone_heading,
    )

    if not reid_result:
        reid_result = {
            "matched": False,
            "reason": "No reliable cross-camera match found on downstream CCTV feed",
            "match_confidence": 0.0,
            "breakdown": {},
        }


    # 6. ANPR & License Plate Recognition (if matched or best candidate in demo mode)
    anpr_result = {
        "plate_detected": False,
        "plate_text": None,
        "confidence": 0.0,
        "reason": "No matched CCTV track for ANPR",
    }
    matched_cctv_track = None
    global_vehicle_id = None

    if reid_result and reid_result.get("matched"):
        matched_tid = reid_result["cctv_track_id"]
        matched_cctv_track = next((t for t in cctv_tracks if t["cctv_track_id"] == matched_tid), None)

        if matched_cctv_track:
            # Run ANPR on best vehicle crops
            anpr_result = run_anpr_on_track_crops(
                matched_cctv_track.get("best_crops", []),
                camera_id=chosen_camera.camera_id,
                track_id=matched_tid,
            )

        # 7. Create Global Vehicle Identity connecting Drone and CCTV
        global_vehicle_id = f"VEHICLE_{str(uuid.uuid4())[:5].upper()}"
        primary_color = reid_result.get("dominant_color", "Metallic Neutral")
        plate_str = anpr_result.get("plate_text")
        plate_conf = anpr_result.get("confidence", 0.0) if anpr_result.get("plate_detected") else 0.0

        upsert_global_vehicle({
            "global_vehicle_id": global_vehicle_id,
            "vehicle_class": drone_class,
            "plate_text": plate_str,
            "plate_confidence": plate_conf,
            "primary_color": primary_color,
            "created_at": time.time(),
        })

        # Record Drone Observation
        add_camera_observation({
            "global_vehicle_id": global_vehicle_id,
            "camera_id": incident["camera_id"],
            "local_track_id": primary_drone_tid,
            "timestamp_start": max(0.0, drone_time_s - 5.0),
            "timestamp_end": drone_time_s,
            "confidence": 1.0,
            "metadata": {"incident_id": incident_id, "role": "incident_origin"},
        })

        # Record CCTV Observation
        if matched_cctv_track:
            add_camera_observation({
                "global_vehicle_id": global_vehicle_id,
                "camera_id": chosen_camera.camera_id,
                "local_track_id": matched_tid,
                "timestamp_start": matched_cctv_track["first_seen_s"],
                "timestamp_end": matched_cctv_track["last_seen_s"],
                "confidence": reid_result["match_confidence"],
                "metadata": {"match_breakdown": reid_result.get("breakdown")},
            })

        # Record ANPR result in DB if detected
        if anpr_result.get("plate_detected"):
            save_anpr_result({
                "result_id": f"ANPR_{uuid.uuid4().hex[:6].upper()}",
                "global_vehicle_id": global_vehicle_id,
                "camera_id": chosen_camera.camera_id,
                "track_id": matched_tid,
                "plate_text": plate_str,
                "confidence": plate_conf,
                "timestamp_s": matched_cctv_track["first_seen_s"],
                "crop_path": anpr_result.get("crop_path", ""),
            })

        update_incident_status(incident_id, "resolved")
    else:
        update_incident_status(incident_id, "open")

    # 8. Build Spatio-Temporal Journey Narrative Timeline
    timeline = [
        {
            "timestamp_s": max(0.0, drone_time_s - 4.5),
            "stage": "Drone Observation",
            "icon": "🛸",
            "camera": incident["camera_id"],
            "description": f"Vehicle initially detected and tracked as local track #{primary_drone_tid}",
        },
        {
            "timestamp_s": drone_time_s,
            "stage": "Incident Flagged",
            "icon": "🚨",
            "camera": incident["camera_id"],
            "description": f"Anomaly detected: {incident['incident_type']} (Confidence: {incident['confidence'] * 100:.0f}%)",
        },
        {
            "timestamp_s": round(drone_time_s + expected_travel_s * 0.7, 1),
            "stage": "CCTV Dispatch",
            "icon": "📹",
            "camera": chosen_camera.camera_id,
            "description": f"Target camera {chosen_camera.camera_id} selected downstream ({selected_cam_info['distance_m']}m away)",
        },
    ]

    if reid_result and reid_result.get("matched") and matched_cctv_track:
        timeline.append({
            "timestamp_s": matched_cctv_track["first_seen_s"],
            "stage": "Cross-Camera Re-ID Match",
            "icon": "🎯",
            "camera": chosen_camera.camera_id,
            "description": f"Vehicle matched with CCTV track #{matched_cctv_track['cctv_track_id']} (Confidence: {reid_result['match_confidence'] * 100:.0f}%)",
        })

    if anpr_result.get("plate_detected"):
        timeline.append({
            "timestamp_s": matched_cctv_track["first_seen_s"] + 0.5 if matched_cctv_track else drone_time_s + 6.0,
            "stage": "ANPR Identification",
            "icon": "🔤",
            "camera": chosen_camera.camera_id,
            "description": f"License plate verified: {anpr_result['plate_text']} (OCR Confidence: {anpr_result['confidence'] * 100:.0f}%)",
        })

    return {
        "status": "done",
        "incident_id": incident_id,
        "investigation_time_s": round(time.time() - t0, 2),
        "incident": incident,
        "selected_camera": selected_cam_info,
        "candidate_cameras": candidate_cameras,
        "cctv_tracking": {
            "model_type": cctv_results.get("model_type"),
            "tracks_count": len(cctv_tracks),
            "matched_track_id": matched_cctv_track["cctv_track_id"] if matched_cctv_track else None,
        },
        "reid_result": reid_result,
        "anpr_result": anpr_result,
        "global_identity": {
            "global_vehicle_id": global_vehicle_id,
            "drone_track_id": primary_drone_tid,
            "cctv_track_id": matched_cctv_track["cctv_track_id"] if matched_cctv_track else None,
            "plate_text": anpr_result.get("plate_text"),
            "plate_detected": anpr_result.get("plate_detected"),
            "status": "Verified Identity" if global_vehicle_id else "Unresolved Match",
        },
        "timeline": timeline,
    }
