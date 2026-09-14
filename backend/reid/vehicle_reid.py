"""
vehicle_reid.py — Cross-Camera Vehicle Re-Identification Engine.

Combines:
1. Multi-region HSV appearance/color histograms (upper/lower vehicle paint profile).
2. Vehicle class compatibility taxonomy.
3. Temporal window consistency (expected vs observed arrival time).
4. Directional heading agreement.

CRITICAL RULE:
Does NOT force a match. If confidence is below REID_THRESHOLD,
returns None ('No reliable cross-camera match').
"""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np

from config import REID_THRESHOLD


def extract_appearance_features(crop_bgr: np.ndarray) -> dict[str, Any]:
    """
    Extract multi-region color histogram & aspect ratio features from a vehicle crop.
    Splits vehicle into top half (roof/glazing) and bottom half (body panels) to capture distinct paint patterns.
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return {"hsv_hist": np.zeros(64, dtype=np.float32), "aspect_ratio": 1.0, "dominant_color": "unknown"}

    h, w = crop_bgr.shape[:2]
    aspect_ratio = float(w) / max(float(h), 1.0)

    # Convert to HSV color space
    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)

    # Split into top and bottom regions
    mid_y = max(1, h // 2)
    top_hsv = hsv[:mid_y, :]
    bot_hsv = hsv[mid_y:, :]

    # 16 bins for Hue (0-180), 8 bins for Saturation (0-256)
    hist_top = cv2.calcHist([top_hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
    hist_bot = cv2.calcHist([bot_hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])

    cv2.normalize(hist_top, hist_top, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(hist_bot, hist_bot, 0, 1, cv2.NORM_MINMAX)

    combined_hist = np.concatenate([hist_top.flatten(), hist_bot.flatten()])

    # Dominant color heuristic (e.g. White, Silver, Black, Red, Blue, Yellow)
    mean_v = float(np.mean(hsv[:, :, 2]))
    mean_s = float(np.mean(hsv[:, :, 1]))
    mean_h = float(np.mean(hsv[:, :, 0]))

    if mean_v < 45:
        dom_color = "Black / Dark"
    elif mean_s < 35 and mean_v > 180:
        dom_color = "White"
    elif mean_s < 45 and 45 <= mean_v <= 180:
        dom_color = "Silver / Grey"
    elif (mean_h < 10 or mean_h > 165) and mean_s > 60:
        dom_color = "Red"
    elif 100 <= mean_h <= 135 and mean_s > 60:
        dom_color = "Blue"
    elif 20 <= mean_h <= 35 and mean_s > 70:
        dom_color = "Yellow / Amber"
    elif 35 <= mean_h <= 85 and mean_s > 50:
        dom_color = "Green"
    else:
        dom_color = "Metallic Neutral"

    return {
        "hsv_hist": combined_hist,
        "aspect_ratio": round(aspect_ratio, 2),
        "dominant_color": dom_color,
    }


def compare_visual_similarity(feat1: dict[str, Any], feat2: dict[str, Any]) -> float:
    """
    Compare visual appearance features using Bhattacharyya distance on HSV histograms.
    Returns similarity in range [0.0, 1.0].
    """
    h1 = feat1.get("hsv_hist")
    h2 = feat2.get("hsv_hist")

    if h1 is None or h2 is None or len(h1) != len(h2):
        return 0.5

    # Bhattacharyya distance: 0 = exact match, 1 = total mismatch
    dist = cv2.compareHist(h1.astype(np.float32), h2.astype(np.float32), cv2.HISTCMP_BHATTACHARYYA)
    hist_sim = max(0.0, 1.0 - float(dist))

    # Aspect ratio penalty
    ar1 = feat1.get("aspect_ratio", 1.0)
    ar2 = feat2.get("aspect_ratio", 1.0)
    ar_diff = abs(ar1 - ar2) / max(ar1, ar2, 0.1)
    ar_sim = max(0.0, 1.0 - ar_diff)

    return float(0.80 * hist_sim + 0.20 * ar_sim)


def class_compatibility(cls_drone: str, cls_cctv: str) -> float:
    """
    Check taxonomy compatibility between VisDrone aerial class and CCTV class.
    """
    c1 = cls_drone.strip().lower()
    c2 = cls_cctv.strip().lower()

    if c1 == c2:
        return 1.0

    # Grouped compatibilities
    four_wheelers = {"car", "van", "lgv", "suv", "sedan"}
    heavy_vehicles = {"truck", "hgv", "bus", "lorry"}
    two_wheelers = {"motorcycle", "motor", "bicycle", "cyclist"}
    three_wheelers = {"three-wheeler", "tricycle", "awning-tricycle", "auto-rickshaw"}

    for group in (four_wheelers, heavy_vehicles, two_wheelers, three_wheelers):
        if c1 in group and c2 in group:
            return 0.85

    # Cross-category penalty
    return 0.0


def temporal_consistency(
    drone_time_s: float,
    cctv_time_s: float,
    expected_travel_s: float,
    tolerance_s: float = 6.0,
) -> float:
    """
    Evaluate whether the time gap between drone observation and CCTV observation
    matches expected travel time.
    """
    actual_gap = cctv_time_s - drone_time_s
    diff = abs(actual_gap - expected_travel_s)
    # Gaussian-shaped score
    score = math.exp(-0.5 * (diff / max(tolerance_s, 1.0)) ** 2)
    return float(score)


def match_drone_to_cctv_tracks(
    drone_vehicle: dict[str, Any],
    cctv_tracks: list[dict[str, Any]],
    expected_travel_s: float = 8.0,
    drone_heading_deg: float | None = None,
    threshold: float = REID_THRESHOLD,
) -> dict[str, Any] | None:
    """
    Compare a drone vehicle against all detected CCTV tracks.
    Returns best matching candidate if score >= threshold, otherwise returns None.
    """
    if not cctv_tracks:
        return None

    drone_cls = drone_vehicle.get("class_name", "car")
    drone_crop = drone_vehicle.get("crop")
    drone_time_s = float(drone_vehicle.get("timestamp_s", 0.0))

    drone_feat = extract_appearance_features(drone_crop) if drone_crop is not None else {
        "hsv_hist": np.zeros(64, dtype=np.float32),
        "aspect_ratio": 1.5,
        "dominant_color": drone_vehicle.get("color", "unknown"),
    }

    candidates = []
    for c_track in cctv_tracks:
        c_cls = c_track.get("class_name", "car")
        c_time_s = float(c_track.get("first_seen_s", drone_time_s + expected_travel_s))
        c_crops = c_track.get("best_crops", [])
        c_heading = float(c_track.get("heading_deg", 0.0))

        # 1. Class score
        s_class = class_compatibility(drone_cls, c_cls)
        if s_class == 0.0:
            continue  # Incompatible categories (e.g. Car vs Motorcycle)

        # 2. Visual score
        if c_crops and len(c_crops) > 0:
            best_c_crop = c_crops[0]["crop"]
            c_feat = extract_appearance_features(best_c_crop)
            s_visual = compare_visual_similarity(drone_feat, c_feat)
        else:
            s_visual = 0.65
            c_feat = {"dominant_color": "unknown"}

        # 3. Temporal score
        s_temporal = temporal_consistency(drone_time_s, c_time_s, expected_travel_s)

        # 4. Direction score
        if drone_heading_deg is not None and c_heading > 0:
            h_diff = abs(drone_heading_deg - c_heading) % 360.0
            if h_diff > 180.0:
                h_diff = 360.0 - h_diff
            s_direction = max(0.0, 1.0 - (h_diff / 120.0))
        else:
            s_direction = 0.75

        # Weighted total score
        total_score = (
            0.45 * s_visual
            + 0.25 * s_class
            + 0.15 * s_temporal
            + 0.15 * s_direction
        )

        candidates.append({
            "cctv_track_id": c_track["cctv_track_id"],
            "class_name": c_cls,
            "match_confidence": round(total_score, 3),
            "breakdown": {
                "visual_similarity": round(s_visual, 2),
                "class_similarity": round(s_class, 2),
                "temporal_similarity": round(s_temporal, 2),
                "direction_similarity": round(s_direction, 2),
            },
            "dominant_color": c_feat.get("dominant_color", "unknown"),
            "best_crops": c_crops,
            "duration_s": c_track.get("duration_s", 0.0),
        })

    if not candidates:
        return None

    # Sort descending by match confidence
    candidates.sort(key=lambda c: c["match_confidence"], reverse=True)
    best = candidates[0]

    # Strict check: Do NOT force match below threshold!
    if best["match_confidence"] < threshold:
        return {
            "matched": False,
            "reason": f"No reliable cross-camera match (Best score {best['match_confidence']} < threshold {threshold})",
            "top_candidate": best,
            "all_candidates": candidates,
        }

    return {
        "matched": True,
        "cctv_track_id": best["cctv_track_id"],
        "class_name": best["class_name"],
        "match_confidence": best["match_confidence"],
        "breakdown": best["breakdown"],
        "dominant_color": best["dominant_color"],
        "best_crops": best["best_crops"],
        "all_candidates": candidates,
    }
