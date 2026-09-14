"""
anpr package — License plate detection, OCR recognition, and multi-frame consensus pipeline.
"""

from anpr.plate_detector import detect_license_plate_crop
from anpr.ocr import recognize_plate_text, validate_indian_plate
from anpr.pipeline import run_anpr_on_track_crops

__all__ = [
    "detect_license_plate_crop",
    "recognize_plate_text",
    "validate_indian_plate",
    "run_anpr_on_track_crops",
]
