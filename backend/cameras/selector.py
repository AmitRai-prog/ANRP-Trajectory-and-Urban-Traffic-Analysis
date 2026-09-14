"""
selector.py — Intelligent CCTV camera selection based on incident location, vehicle heading, and travel time.
"""

from __future__ import annotations

import math
from typing import Any

from cameras.manager import Camera


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two GPS points in metres."""
    r = 6371000.0  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def bearing_between_coords(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate initial bearing from point 1 to point 2 in degrees (0..360, 0 = North)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)

    y = math.sin(dlambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    b = math.degrees(math.atan2(y, x))
    return (b + 360.0) % 360.0


def angle_difference(a1: float, a2: float) -> float:
    """Minimal angular difference between two angles in degrees (0..180)."""
    diff = abs(a1 - a2) % 360.0
    return 360.0 - diff if diff > 180.0 else diff


def select_relevant_cameras(
    incident: dict[str, Any],
    cameras: list[Camera],
    vehicle_heading_deg: float | None = None,
    vehicle_speed_kmh: float = 25.0,
) -> list[dict[str, Any]]:
    """
    Rank and select the most relevant CCTV cameras to investigate an incident.

    Signals considered:
    1. Distance from incident location to camera coverage radius.
    2. Heading alignment: Is the vehicle traveling TOWARD the camera's field of view?
    3. Camera line-of-sight: Does the camera face the incoming corridor?
    4. Estimated travel window (ETW): When should the vehicle appear?
    """
    inc_lat = float(incident.get("latitude", 18.566227))
    inc_lon = float(incident.get("longitude", 73.771846))
    inc_time_s = float(incident.get("timestamp_s", 0.0))

    # If vehicle heading is not provided, check incident details
    if vehicle_heading_deg is None:
        vehicle_heading_deg = incident.get("details", {}).get("vehicle_heading_deg")

    speed_mps = max(vehicle_speed_kmh / 3.6, 2.0)  # Min 2 m/s

    candidates = []
    for cam in cameras:
        # Ignore drone cameras for ground-level CCTV handoff
        if cam.camera_type == "drone":
            continue

        dist_m = haversine_distance_m(inc_lat, inc_lon, cam.latitude, cam.longitude)
        bearing_to_cam = bearing_between_coords(inc_lat, inc_lon, cam.latitude, cam.longitude)

        # Distance score: closer cameras score higher up to 300m
        dist_score = max(0.0, 1.0 - (dist_m / 350.0))

        # Heading score: vehicle travel vector pointing towards camera
        if vehicle_heading_deg is not None:
            heading_diff = angle_difference(vehicle_heading_deg, bearing_to_cam)
            heading_score = max(0.0, 1.0 - (heading_diff / 120.0))
        else:
            heading_score = 0.5

        # Camera viewing angle score: camera facing towards the incident
        facing_diff = angle_difference(cam.bearing, (bearing_to_cam + 180.0) % 360.0)
        facing_score = max(0.0, 1.0 - (facing_diff / 100.0))

        # Composite score
        total_score = (
            0.40 * dist_score
            + 0.40 * heading_score
            + 0.20 * facing_score
        )

        # Expected travel time window
        travel_sec = dist_m / speed_mps
        etw_start_s = round(inc_time_s + max(travel_sec * 0.7, 1.0), 1)
        etw_end_s = round(inc_time_s + travel_sec * 1.5 + 5.0, 1)

        # Rationale string
        if heading_score > 0.7:
            rationale = f"Directly downstream along vehicle trajectory ({dist_m:.0f}m away, ETW +{travel_sec:.0f}s)"
        elif dist_score > 0.8:
            rationale = f"Immediate junction vicinity camera ({dist_m:.0f}m away)"
        else:
            rationale = f"Secondary corridor coverage ({dist_m:.0f}m away)"

        candidates.append({
            "camera_id": cam.camera_id,
            "camera_name": cam.name,
            "location": cam.location,
            "distance_m": round(dist_m, 1),
            "relevance_score": round(total_score, 3),
            "bearing_deg": cam.bearing,
            "expected_window_s": {"start": etw_start_s, "end": etw_end_s},
            "rationale": rationale,
            "stream_url": cam.stream_url,
            "status": cam.status,
        })

    # Sort descending by relevance score
    candidates.sort(key=lambda c: c["relevance_score"], reverse=True)
    return candidates
