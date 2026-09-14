"""
cctv package — Ground-perspective CCTV vehicle detection and ByteTrack tracking.
"""

from cctv.tracker import get_cctv_model, run_cctv_tracking

__all__ = [
    "get_cctv_model",
    "run_cctv_tracking",
]
