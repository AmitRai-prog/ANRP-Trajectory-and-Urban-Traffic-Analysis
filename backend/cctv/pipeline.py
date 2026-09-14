"""
cctv/pipeline.py — Dedicated, standalone CCTV Vehicle Tracking & License Plate Extraction Pipeline.

Decoupled from aerial incident workflows:
CCTV Recording → Vehicle Detection & ByteTrack → License Plate Localization
→ Best Frame Selection & Quality Filtering → OCR & Multi-Frame Consensus
→ Number Plate Results.
"""

from __future__ import annotations

import math
import time
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np
import supervision as sv
from ultralytics import YOLO

from anpr.pipeline import run_anpr_on_track_crops
from anpr.plate_detector import detect_license_plate_crop
from cameras.sources import FileVideoSource
from config import (
    ANPR_CONFIDENCE_THRESHOLD,
    CCTV_MODEL_PATH,
    OUTPUT_DIR,
    PLATE_STORAGE_ENABLED,
    pick_device,
)
from tracker import get_model as get_drone_fallback_model

_cctv_model_cache: dict[str, YOLO] = {}


def get_cctv_detector() -> tuple[YOLO, str]:
    """Get CCTV-specific YOLO detector, or fall back to VisDrone model."""
    if "model" not in _cctv_model_cache:
        if CCTV_MODEL_PATH and Path(CCTV_MODEL_PATH).exists():
            _cctv_model_cache["model"] = YOLO(CCTV_MODEL_PATH)
            _cctv_model_cache["type"] = "CCTV-Optimized Model"
        else:
            _cctv_model_cache["model"] = get_drone_fallback_model()
            _cctv_model_cache["type"] = "Standard Vehicle Model"
    return _cctv_model_cache["model"], _cctv_model_cache["type"]


def run_independent_cctv_pipeline(
    video_path: Path | str,
    out_dir: Path | str | None = None,
    max_frames: int = 300,
    stride: int = 2,
    conf_threshold: float = 0.25,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """
    Execute full independent CCTV video analysis:
    - Vehicle Detection & Tracking
    - Dedicated License Plate Detection per vehicle
    - Best Frame Selection (sharpness, size, contrast, brightness)
    - Image Preprocessing & Multi-Frame OCR Consensus
    - Structured Summary and Detailed Vehicle Inspection Data
    """
    video_path = Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    out_dir = Path(out_dir) if out_dir else OUTPUT_DIR / "cctv" / uuid.uuid4().hex[:8]
    out_dir.mkdir(parents=True, exist_ok=True)

    crops_dir = OUTPUT_DIR / "anpr_crops"
    crops_dir.mkdir(parents=True, exist_ok=True)

    source = FileVideoSource(video_path)
    if not source.open():
        raise RuntimeError(f"Failed to open CCTV video: {video_path}")

    device, use_half = pick_device("auto")
    model, model_type = get_cctv_detector()
    class_names = model.names

    fps = source.get_fps() or 25.0
    total_frames = source.get_frame_count() or 0
    process_total = min(total_frames, max_frames) if total_frames > 0 else max_frames

    tracker = sv.ByteTrack(
        track_activation_threshold=conf_threshold,
        lost_track_buffer=30,
        minimum_matching_threshold=0.80,
        frame_rate=max(fps / stride, 1.0),
    )

    track_crops: dict[int, list[dict[str, Any]]] = defaultdict(list)
    track_metadata: dict[int, dict[str, Any]] = {}
    track_classes: dict[int, list[str]] = defaultdict(list)

    frame_count = 0
    processed_count = 0
    t_start = time.time()

    try:
        for f_idx, t_sec, frame in source.frames():
            if frame_count >= max_frames:
                break
            frame_count += 1

            if f_idx % stride != 0:
                continue
            processed_count += 1

            # 1. Forward pass for vehicle detection (ground perspective)
            predict_kwargs = dict(device=device, conf=conf_threshold, verbose=False)
            if use_half:
                predict_kwargs["quantize"] = 16

            res = model.predict(frame, **predict_kwargs)[0]
            detections = sv.Detections.from_ultralytics(res)

            if len(detections) > 0:
                # 2. Vehicle tracking with ByteTrack
                detections = tracker.update_with_detections(detections)

                for i in range(len(detections)):
                    if detections.tracker_id is None:
                        continue
                    tid = int(detections.tracker_id[i])
                    if tid < 0:
                        continue

                    x1, y1, x2, y2 = detections.xyxy[i]
                    cls_id = int(detections.class_id[i]) if detections.class_id is not None else -1
                    conf = float(detections.confidence[i]) if detections.confidence is not None else 0.5
                    cname = class_names.get(cls_id, "vehicle")

                    ih, iw = frame.shape[:2]
                    ix1, iy1 = max(0, int(x1)), max(0, int(y1))
                    ix2, iy2 = min(iw, int(x2)), min(ih, int(y2))

                    # Filter out tiny artefacts (< 40x30 px)
                    if (ix2 - ix1) < 40 or (iy2 - iy1) < 30:
                        continue

                    track_classes[tid].append(cname)
                    crop_bgr = frame[iy1:iy2, ix1:ix2].copy()

                    # Sharpness metric on vehicle crop
                    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
                    v_sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

                    track_crops[tid].append({
                        "frame_idx": f_idx,
                        "timestamp_s": round(t_sec, 2),
                        "crop": crop_bgr,
                        "sharpness": round(v_sharpness, 1),
                        "box": [ix1, iy1, ix2, iy2],
                        "conf": round(conf, 2),
                    })

                    # Maintain track lifetime metadata
                    if tid not in track_metadata:
                        track_metadata[tid] = {
                            "first_seen_s": round(t_sec, 2),
                            "last_seen_s": round(t_sec, 2),
                            "first_frame": f_idx,
                            "last_frame": f_idx,
                            "positions": [],
                        }
                    else:
                        track_metadata[tid]["last_seen_s"] = round(t_sec, 2)
                        track_metadata[tid]["last_frame"] = f_idx

                    track_metadata[tid]["positions"].append((float((ix1 + ix2) / 2.0), float((iy1 + iy2) / 2.0)))

            # Emit progress update periodically
            if on_progress and processed_count % 5 == 0:
                elapsed = max(time.time() - t_start, 0.001)
                cur_fps = round(processed_count / elapsed, 1)
                pct = min(int((frame_count / max(process_total, 1)) * 90), 90)
                on_progress({
                    "step": "vehicle_tracking",
                    "processed_frames": frame_count,
                    "total_frames": process_total,
                    "progress_pct": pct,
                    "vehicles_tracked": len(track_crops),
                    "fps": cur_fps,
                    "message": f"Tracking vehicles (Frame {frame_count}/{process_total}, {len(track_crops)} vehicles found)...",
                })

    finally:
        source.release()

    # 3. Dedicated License Plate Detection, Best Frame Selection & OCR per Vehicle
    if on_progress:
        on_progress({
            "step": "plate_extraction",
            "progress_pct": 92,
            "message": f"Running dedicated license plate detection & OCR on {len(track_crops)} vehicles...",
        })

    vehicles_results = []
    readable_count = 0
    unreadable_count = 0

    # Sort tracks by duration / number of detections descending
    sorted_tids = sorted(track_crops.keys(), key=lambda t: len(track_crops[t]), reverse=True)

    for idx, tid in enumerate(sorted_tids):
        crops_list = track_crops[tid]
        if len(crops_list) < 2:
            continue

        # Determine consensus vehicle class
        class_counts = defaultdict(int)
        for c in track_classes[tid]:
            class_counts[c] += 1
        majority_class = max(class_counts, key=class_counts.get)
        # Beautify class name
        display_class = majority_class.capitalize()

        meta = track_metadata.get(tid, {})
        duration_s = round(meta.get("last_seen_s", 0.0) - meta.get("first_seen_s", 0.0), 2)

        # Run dedicated ANPR pipeline on this vehicle track's crops
        anpr_res = run_anpr_on_track_crops(
            crops_list,
            camera_id="CCTV",
            track_id=tid,
            threshold=ANPR_CONFIDENCE_THRESHOLD,
        )

        plate_detected = anpr_res.get("plate_detected", False)
        plate_status = anpr_res.get("plate_status", "Plate not detected")
        plate_text = anpr_res.get("plate_text")
        conf = anpr_res.get("confidence", 0.0)
        reason = anpr_res.get("reason", "")
        frame_evals = anpr_res.get("frame_evaluations", [])

        # Paths for UI display
        crop_path = anpr_res.get("crop_path")
        veh_crop_path = anpr_res.get("vehicle_crop_path")

        plate_crop_filename = Path(crop_path).name if crop_path else None
        veh_crop_filename = Path(veh_crop_path).name if veh_crop_path else None

        if plate_detected and plate_text:
            readable_count += 1
        else:
            unreadable_count += 1

        vehicle_label = f"Vehicle {len(vehicles_results) + 1:02d}"

        # Find best detected frame index
        best_frame_idx = crops_list[0]["frame_idx"]
        best_timestamp = crops_list[0]["timestamp_s"]
        if frame_evals:
            best_eval = max(frame_evals, key=lambda e: e.get("sharpness", 0.0))
            best_frame_idx = best_eval.get("frame_idx", best_frame_idx)
            best_timestamp = best_eval.get("timestamp_s", best_timestamp)

        vehicles_results.append({
            "vehicle_id": vehicle_label,
            "track_id": tid,
            "class_name": display_class,
            "plate_text": plate_text if plate_detected else None,
            "plate_status": plate_status,
            "confidence": round(conf * 100.0, 1) if plate_detected else round(conf * 100.0, 1),
            "confidence_ratio": conf,
            "is_readable": plate_detected,
            "reason": reason,
            "first_seen_s": meta.get("first_seen_s", 0.0),
            "last_seen_s": meta.get("last_seen_s", 0.0),
            "best_frame_idx": best_frame_idx,
            "best_timestamp_s": best_timestamp,
            "duration_s": duration_s,
            "detections_count": len(crops_list),
            "plate_crop_url": f"/api/anpr/crop/{plate_crop_filename}" if plate_crop_filename else None,
            "vehicle_crop_url": f"/api/anpr/crop/{veh_crop_filename}" if veh_crop_filename else None,
            "consensus_agreement": anpr_res.get("consensus_agreement", ""),
            "frame_evaluations": [
                {
                    "frame_idx": ev.get("frame_idx"),
                    "timestamp_s": ev.get("timestamp_s"),
                    "sharpness": ev.get("sharpness", 0.0),
                    "detected_text": ev.get("detected_text"),
                    "confidence": round((ev.get("ocr_confidence") or 0.0) * 100.0, 1),
                    "status": ev.get("ocr_reason", ""),
                }
                for ev in frame_evals
            ],
        })

    # Compile Final Structured Result
    total_vehicles = len(vehicles_results)
    summary = {
        "vehicles_detected": total_vehicles,
        "readable_plates": readable_count,
        "unreadable_plates": unreadable_count,
        "readability_rate_pct": round((readable_count / max(total_vehicles, 1)) * 100.0, 1),
        "total_frames_processed": frame_count,
        "video_duration_s": round(frame_count / fps, 1),
        "source_fps": round(fps, 1),
        "model_type": model_type,
    }

    result = {
        "status": "done",
        "video_filename": video_path.name,
        "summary": summary,
        "vehicles": vehicles_results,
    }

    if on_progress:
        on_progress({
            "step": "done",
            "progress_pct": 100,
            "summary": summary,
            "message": "CCTV Number Plate Analysis Complete!",
        })

    return result
