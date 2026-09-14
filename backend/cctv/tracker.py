"""
cctv/tracker.py — Ground-perspective CCTV vehicle detection and ByteTrack tracking pipeline.

Decoupled from drone aerial parameters:
- Does NOT perform heavy aerial tiling (vehicles in ground CCTV are large and perspective-distorted).
- Uses standard YOLO forward pass (configurable CCTV model or fallback VisDrone/YOLO).
- Assigns local CCTV `track_id`s (e.g. CCTV track #43).
- Extracts best vehicle crops, timestamps, speeds, and trajectory headings for Re-ID and ANPR.
"""

from __future__ import annotations

import math
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import supervision as sv
from ultralytics import YOLO

from cameras.sources import VideoSource
from config import CCTV_MODEL_PATH, pick_device
from tracker import get_model as get_drone_fallback_model


_cctv_model_cache: dict[str, YOLO] = {}


def get_cctv_model() -> tuple[YOLO, str]:
    """
    Get CCTV-specific YOLO detector, or fall back to VisDrone model with prototype label.
    """
    if "model" not in _cctv_model_cache:
        if CCTV_MODEL_PATH and Path(CCTV_MODEL_PATH).exists():
            _cctv_model_cache["model"] = YOLO(CCTV_MODEL_PATH)
            _cctv_model_cache["type"] = "CCTV-Optimized Model"
        else:
            # Fallback to existing VisDrone model, clearly labeled as prototype
            _cctv_model_cache["model"] = get_drone_fallback_model()
            _cctv_model_cache["type"] = "VisDrone Fallback (Prototype Mode)"
    return _cctv_model_cache["model"], _cctv_model_cache["type"]


def run_cctv_tracking(
    source: VideoSource,
    max_frames: int = 150,
    stride: int = 2,
    conf_threshold: float = 0.25,
) -> dict[str, Any]:
    """
    Process CCTV video frames, detect vehicles, track with ByteTrack, and extract vehicle crops.
    """
    if not source.is_opened() and not source.open():
        return {
            "status": "error",
            "error": "Could not open CCTV video source",
            "tracks": [],
            "crops": {},
        }

    device, use_half = pick_device("auto")
    model, model_type = get_cctv_model()
    class_names = model.names

    fps = source.get_fps() or 25.0
    dt = stride / fps

    tracker = sv.ByteTrack(
        track_activation_threshold=conf_threshold,
        lost_track_buffer=30,
        minimum_matching_threshold=0.80,
        frame_rate=max(fps / stride, 1.0),
    )

    track_crops: dict[int, list[dict[str, Any]]] = defaultdict(list)
    track_records: dict[int, list[dict[str, Any]]] = defaultdict(list)
    track_classes: dict[int, list[str]] = defaultdict(list)

    frame_count = 0
    processed_count = 0

    try:
        for f_idx, t_sec, frame in source.frames():
            if frame_count >= max_frames:
                break
            frame_count += 1

            if f_idx % stride != 0:
                continue
            processed_count += 1

            # Standard 640/1080p forward pass (no heavy tiling required for ground CCTV)
            predict_kwargs = dict(device=device, conf=conf_threshold, verbose=False)
            if use_half:
                predict_kwargs["quantize"] = 16

            res = model.predict(frame, **predict_kwargs)[0]
            detections = sv.Detections.from_ultralytics(res)

            # Filter for vehicle/VRU classes (cars, buses, trucks, vans, motorcycles)
            if len(detections) > 0:
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

                    cx = float((x1 + x2) / 2.0)
                    cy = float(y2)
                    w = float(x2 - x1)
                    h = float(y2 - y1)

                    track_classes[tid].append(cname)

                    # Extract vehicle crop for Re-ID and ANPR (ensure valid bounds)
                    ih, iw = frame.shape[:2]
                    ix1, iy1 = max(0, int(x1)), max(0, int(y1))
                    ix2, iy2 = min(iw, int(x2)), min(ih, int(y2))

                    if (ix2 - ix1) > 30 and (iy2 - iy1) > 20:
                        crop_bgr = frame[iy1:iy2, ix1:ix2].copy()
                        # Compute Laplacian blur metric to find sharpest frames for ANPR
                        gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
                        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

                        track_crops[tid].append({
                            "frame_idx": f_idx,
                            "timestamp_s": round(t_sec, 2),
                            "crop": crop_bgr,
                            "sharpness": round(sharpness, 1),
                            "box": [ix1, iy1, ix2, iy2],
                        })

                    track_records[tid].append({
                        "frame_idx": f_idx,
                        "timestamp_s": round(t_sec, 2),
                        "cx": cx,
                        "cy": cy,
                        "w": w,
                        "h": h,
                        "conf": round(conf, 3),
                    })

    finally:
        source.release()

    # Summarize CCTV tracks
    summarized_tracks = []
    for tid, recs in track_records.items():
        if len(recs) < 2:
            continue

        cname_counts = defaultdict(int)
        for cn in track_classes[tid]:
            cname_counts[cn] += 1
        majority_class = max(cname_counts, key=cname_counts.get)

        # Estimate displacement & speed in px
        t_start = recs[0]["timestamp_s"]
        t_end = recs[-1]["timestamp_s"]
        duration = round(t_end - t_start, 2)

        cx_vals = [r["cx"] for r in recs]
        cy_vals = [r["cy"] for r in recs]
        disp_px = math.hypot(cx_vals[-1] - cx_vals[0], cy_vals[-1] - cy_vals[0])

        # Heading vector in image coordinates
        dx = cx_vals[-1] - cx_vals[0]
        dy = cy_vals[-1] - cy_vals[0]
        heading_deg = math.degrees(math.atan2(dx, dy)) % 360.0 if disp_px > 5 else 0.0

        # Sort crops by sharpness descending
        crops_sorted = sorted(track_crops[tid], key=lambda c: c["sharpness"], reverse=True)

        summarized_tracks.append({
            "cctv_track_id": int(tid),
            "class_name": majority_class,
            "detections": len(recs),
            "duration_s": duration,
            "first_seen_s": t_start,
            "last_seen_s": t_end,
            "displacement_px": round(disp_px, 1),
            "heading_deg": round(heading_deg, 1),
            "best_crops": crops_sorted[:6],  # Top sharpest crops
            "raw_records": recs,
        })

    return {
        "status": "done",
        "model_type": model_type,
        "frames_processed": processed_count,
        "tracks": summarized_tracks,
    }
