"""
pipeline.py — End-to-end multi-frame ANPR pipeline with best-frame selection, quality filtering, and OCR consensus.
"""

from __future__ import annotations

import time
import uuid
from collections import Counter
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from anpr.ocr import recognize_plate_text
from anpr.plate_detector import detect_license_plate_crop, evaluate_plate_quality
from config import ANPR_CONFIDENCE_THRESHOLD, OUTPUT_DIR, PLATE_STORAGE_ENABLED


def run_anpr_on_track_crops(
    crops: list[dict[str, Any]],
    camera_id: str = "CCTV_01",
    track_id: int = 1,
    threshold: float = ANPR_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    """
    Execute dedicated ANPR pipeline for a tracked vehicle:
    1. Plate candidate detection across observed vehicle frames.
    2. Plate quality evaluation & filtering (size, sharpness, contrast, brightness).
    3. Best-frame selection (top 3-5 candidates).
    4. Image preprocessing & OCR on best candidates.
    5. Multi-frame OCR consensus voting.
    6. Honest status communication (No fake plates).
    """
    if not crops:
        return {
            "plate_detected": False,
            "plate_status": "Plate not detected",
            "plate_text": None,
            "confidence": 0.0,
            "reason": "No vehicle frames available for inspection",
            "frame_evaluations": [],
            "crop_path": None,
            "vehicle_crop_path": None,
        }

    anpr_dir = OUTPUT_DIR / "anpr_crops"
    anpr_dir.mkdir(parents=True, exist_ok=True)

    # 1. Inspect all crops for license plate candidates
    detected_candidates = []
    saved_vehicle_crop_path = None

    for idx, c in enumerate(crops):
        crop_img = c.get("crop")
        if crop_img is None or crop_img.size == 0:
            continue

        f_idx = c.get("frame_idx", idx)
        t_sec = c.get("timestamp_s", 0.0)

        # Save best vehicle crop if not already saved
        if saved_vehicle_crop_path is None and PLATE_STORAGE_ENABLED:
            v_fname = f"{camera_id}_veh{track_id}_{uuid.uuid4().hex[:6]}.jpg"
            v_path = anpr_dir / v_fname
            cv2.imwrite(str(v_path), crop_img)
            saved_vehicle_crop_path = str(v_path)

        found, plate_bgr, det_conf, quality = detect_license_plate_crop(crop_img)
        if found and plate_bgr is not None:
            detected_candidates.append({
                "frame_idx": f_idx,
                "timestamp_s": t_sec,
                "plate_bgr": plate_bgr,
                "det_conf": det_conf,
                "quality": quality,
                "quality_score": quality.get("quality_score", 0.5),
            })

    # Case A: No plate detected in any observed frame
    if not detected_candidates:
        return {
            "plate_detected": False,
            "plate_status": "Plate not detected",
            "plate_text": None,
            "confidence": 0.0,
            "reason": "No license plate detected in any observed frame",
            "frame_evaluations": [],
            "crop_path": None,
            "vehicle_crop_path": saved_vehicle_crop_path,
        }

    # 2. Check resolution of detected plate candidates
    max_w = max(c["quality"]["width"] for c in detected_candidates)
    max_h = max(c["quality"]["height"] for c in detected_candidates)

    if max_w < 38 or max_h < 11:
        # Save sample plate crop for UI verification
        sample_crop = detected_candidates[0]["plate_bgr"]
        p_fname = f"{camera_id}_plate{track_id}_{uuid.uuid4().hex[:6]}.jpg"
        p_path = anpr_dir / p_fname
        cv2.imwrite(str(p_path), sample_crop)

        return {
            "plate_detected": False,
            "plate_status": "Insufficient plate resolution",
            "plate_text": None,
            "confidence": 0.0,
            "reason": f"Plate resolution ({max_w}x{max_h}px) too low for reliable OCR",
            "frame_evaluations": [],
            "crop_path": str(p_path),
            "vehicle_crop_path": saved_vehicle_crop_path,
        }

    # 3. Best Frame Selection: Sort by composite quality score descending, pick top 4
    detected_candidates.sort(key=lambda c: c["quality_score"], reverse=True)
    best_candidates = detected_candidates[:4]

    evaluations = []
    recognized_candidates = []
    saved_plate_crop_path = None

    for cand in best_candidates:
        plate_bgr = cand["plate_bgr"]
        f_idx = cand["frame_idx"]
        t_sec = cand["timestamp_s"]
        q = cand["quality"]

        # Save sharpest plate crop image for display
        if saved_plate_crop_path is None and PLATE_STORAGE_ENABLED:
            p_fname = f"{camera_id}_plate{track_id}_{uuid.uuid4().hex[:6]}.jpg"
            p_path = anpr_dir / p_fname
            cv2.imwrite(str(p_path), plate_bgr)
            saved_plate_crop_path = str(p_path)

        text, ocr_conf, ocr_reason = recognize_plate_text(plate_bgr)

        evaluations.append({
            "frame_idx": f_idx,
            "timestamp_s": t_sec,
            "sharpness": q.get("sharpness", 0.0),
            "contrast": q.get("contrast", 0.0),
            "width": q.get("width", 0),
            "height": q.get("height", 0),
            "plate_found": True,
            "detected_text": text,
            "ocr_confidence": round(ocr_conf, 2),
            "ocr_reason": ocr_reason,
        })

        if text and ocr_conf > 0.35:
            recognized_candidates.append((text, ocr_conf))

    # Case B: Plate detected, but characters were unreadable
    if not recognized_candidates:
        return {
            "plate_detected": False,
            "plate_status": "Plate detected but unreadable",
            "plate_text": None,
            "confidence": 0.0,
            "reason": "Blur / reflection prevented reliable character recognition",
            "frame_evaluations": evaluations,
            "crop_path": saved_plate_crop_path,
            "vehicle_crop_path": saved_vehicle_crop_path,
        }

    # 4. Multi-frame Consensus Voting
    plate_counts = Counter([cand[0] for cand in recognized_candidates])
    consensus_text, count = plate_counts.most_common(1)[0]

    matching_confs = [cand[1] for cand in recognized_candidates if cand[0] == consensus_text]
    mean_conf = float(np.mean(matching_confs))
    agreement_ratio = count / max(len(recognized_candidates), 1)
    final_confidence = round(0.65 * mean_conf + 0.35 * agreement_ratio, 2)

    # Case C: Confidence below threshold
    if final_confidence < threshold:
        return {
            "plate_detected": False,
            "plate_status": "OCR confidence too low",
            "plate_text": consensus_text,
            "confidence": final_confidence,
            "reason": f"OCR confidence ({int(final_confidence * 100)}%) below threshold ({int(threshold * 100)}%)",
            "consensus_agreement": f"{count}/{len(recognized_candidates)} frames",
            "frame_evaluations": evaluations,
            "crop_path": saved_plate_crop_path,
            "vehicle_crop_path": saved_vehicle_crop_path,
        }

    # Case D: High-confidence readable plate
    return {
        "plate_detected": True,
        "plate_status": "Readable",
        "plate_text": consensus_text,
        "confidence": final_confidence,
        "consensus_agreement": f"{count}/{len(recognized_candidates)} frames",
        "reason": f"Multi-frame consensus verified across {count} frames",
        "crop_path": saved_plate_crop_path,
        "vehicle_crop_path": saved_vehicle_crop_path,
        "frame_evaluations": evaluations,
    }
