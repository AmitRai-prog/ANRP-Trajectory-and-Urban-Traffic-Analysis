"""
plate_detector.py — High-precision license plate region localization on vehicle crops.

Employs edge filtering, morphological blackhat operations, and aspect ratio constraints
tailored for standard Indian and international license plates (aspect ratio 2.5 - 5.5).
"""

from __future__ import annotations

from typing import Tuple

import cv2
import numpy as np


def evaluate_plate_quality(plate_bgr: np.ndarray) -> dict[str, float]:
    """
    Calculate quality metrics for a license plate candidate:
    - size (w, h, area)
    - sharpness (Laplacian variance)
    - brightness (mean intensity)
    - contrast (standard deviation of intensity)
    - composite quality score in [0.0, 1.0]
    """
    if plate_bgr is None or plate_bgr.size == 0:
        return {
            "width": 0,
            "height": 0,
            "sharpness": 0.0,
            "brightness": 0.0,
            "contrast": 0.0,
            "quality_score": 0.0,
        }

    h, w = plate_bgr.shape[:2]
    gray = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY) if len(plate_bgr.shape) == 3 else plate_bgr

    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))

    # Normalized components for composite quality
    s_norm = min(sharpness / 250.0, 1.0)
    w_norm = min(w / 120.0, 1.0)
    c_norm = min(contrast / 65.0, 1.0)
    # Penalize extreme dark (<30) or washed-out (>230) brightness
    b_score = 1.0 if 40.0 <= brightness <= 215.0 else max(0.1, 1.0 - abs(brightness - 128.0) / 128.0)

    quality_score = round(0.35 * s_norm + 0.25 * w_norm + 0.25 * c_norm + 0.15 * b_score, 3)

    return {
        "width": int(w),
        "height": int(h),
        "sharpness": round(sharpness, 1),
        "brightness": round(brightness, 1),
        "contrast": round(contrast, 1),
        "quality_score": quality_score,
    }


def detect_license_plate_crop(
    vehicle_crop_bgr: np.ndarray,
) -> Tuple[bool, np.ndarray | None, float, dict[str, Any]]:
    """
    Locate and crop license plate candidate region from a vehicle crop.
    Separates vehicle detection from license plate detection.
    Evaluates quality (size, sharpness, brightness, contrast).
    Returns: (found, plate_crop_bgr, detection_confidence, quality_metrics)
    Does NOT invent or return fake crops if no plate is detected.
    """
    empty_quality = {
        "width": 0,
        "height": 0,
        "sharpness": 0.0,
        "brightness": 0.0,
        "contrast": 0.0,
        "quality_score": 0.0,
    }

    if vehicle_crop_bgr is None or vehicle_crop_bgr.size == 0:
        return False, None, 0.0, empty_quality

    vh, vw = vehicle_crop_bgr.shape[:2]
    if vh < 30 or vw < 40:
        return False, None, 0.0, empty_quality

    # License plates are predominantly located in the lower 65% of the vehicle body
    search_region_y = int(vh * 0.35)
    search_bgr = vehicle_crop_bgr[search_region_y:, :]
    sh, sw = search_bgr.shape[:2]

    # Convert to grayscale
    gray = cv2.cvtColor(search_bgr, cv2.COLOR_BGR2GRAY)

    # Contrast enhancement with CLAHE
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Morphological Blackhat: reveals dark characters on light background plates
    rect_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
    blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, rect_kernel)

    # Compute Scharr gradient along X axis to detect vertical character strokes
    grad_x = cv2.Sobel(blackhat, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=-1)
    grad_x = np.absolute(grad_x)
    min_val, max_val = np.min(grad_x), np.max(grad_x)
    if max_val > min_val:
        grad_x = 255 * ((grad_x - min_val) / (max_val - min_val))
    grad_x = grad_x.astype("uint8")

    # Blur gradient and apply Otsu thresholding
    grad_x = cv2.GaussianBlur(grad_x, (5, 5), 0)
    _, thresh = cv2.threshold(grad_x, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

    # Close gaps between characters to form solid plate mask
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, rect_kernel)
    thresh = cv2.erode(thresh, None, iterations=1)
    thresh = cv2.dilate(thresh, None, iterations=2)

    # Find contours
    contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best_crop = None
    best_conf = 0.0
    best_box = None

    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if h == 0 or w == 0:
            continue

        aspect_ratio = float(w) / float(h)
        # Indian plates standard ratio ~ 2.2 to 5.8
        if 2.0 <= aspect_ratio <= 6.0:
            # Area must be reasonable relative to search region
            area_ratio = float(w * h) / float(sw * sh)
            if 0.010 <= area_ratio <= 0.30 and w >= 36 and h >= 10:
                # Score based on how close aspect ratio is to typical 3.5-4.2
                ar_score = 1.0 - (abs(aspect_ratio - 3.8) / 3.8)
                conf = max(0.40, min(ar_score * 0.92, 0.95))

                if conf > best_conf:
                    best_conf = conf
                    # Add small padding around plate crop
                    pad_x = int(w * 0.06)
                    pad_y = int(h * 0.12)
                    px1 = max(0, x - pad_x)
                    py1 = max(0, y - pad_y)
                    px2 = min(sw, x + w + pad_x)
                    py2 = min(sh, y + h + pad_y)
                    best_crop = search_bgr[py1:py2, px1:px2].copy()
                    best_box = (px1, py1 + search_region_y, px2 - px1, py2 - py1)

    if best_crop is not None and best_crop.size > 0:
        quality = evaluate_plate_quality(best_crop)
        quality["box"] = best_box
        return True, best_crop, round(best_conf, 2), quality

    # NO fake fallback: return False honestly if no genuine plate is detected
    return False, None, 0.0, empty_quality
