"""
reid package — Cross-camera vehicle re-identification and appearance matching.
"""

from reid.vehicle_reid import (
    extract_appearance_features,
    compare_visual_similarity,
    class_compatibility,
    temporal_consistency,
    match_drone_to_cctv_tracks,
)

__all__ = [
    "extract_appearance_features",
    "compare_visual_similarity",
    "class_compatibility",
    "temporal_consistency",
    "match_drone_to_cctv_tracks",
]
