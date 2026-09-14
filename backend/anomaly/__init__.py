"""
anomaly package — Rule-based incident detection, kinematic anomaly scoring, and clustering.
"""

from anomaly.detector import detect_track_anomalies, detect_multi_vehicle_interactions
from anomaly.scoring import compute_incident_score, build_incidents_from_tracking

__all__ = [
    "detect_track_anomalies",
    "detect_multi_vehicle_interactions",
    "compute_incident_score",
    "build_incidents_from_tracking",
]
