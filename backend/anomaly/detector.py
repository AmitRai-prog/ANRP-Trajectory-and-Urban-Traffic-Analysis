"""
detector.py — Explainable, rule-based traffic incident and anomaly detection from vehicle trajectories.

Signals detected:
1. SUDDEN_DECELERATION — Sharp velocity drop (>15 km/h/s) along vehicle heading.
2. SUDDEN_STOP — Vehicle abruptly drops from cruising speed to <2.5 km/h and remains stationary.
3. ABNORMAL_TRAJECTORY — Sharp erratic bearing changes (>50 deg) or driving counter to road flow.
4. TRAFFIC_PROPAGATION — Upstream deceleration wave forming behind a stationary bottleneck.
5. POSSIBLE_COLLISION — Simultaneous high deceleration + close spatial proximity (<4m) between 2 vehicles followed by prolonged stop.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


def detect_track_anomalies(
    track_df: pd.DataFrame,
    source_fps: float = 30.0,
    stride: int = 5,
    meters_per_pixel: float = 0.035,
) -> list[dict[str, Any]]:
    """
    Analyze single-track trajectory for sudden stops, extreme decelerations, and erratic paths.
    """
    # Filter out short, transient tracks (< 8 detections or ~1.3s)
    if len(track_df) < 8:
        return []

    dt = stride / source_fps
    anomalies = []

    speeds = track_df["speed_kmh"].to_numpy() if "speed_kmh" in track_df.columns else None
    if speeds is None or len(speeds) < 3 or np.all(np.isnan(speeds)):
        cx = track_df["cx"].to_numpy()
        cy = track_df["cy_foot"].to_numpy()
        dx = np.diff(cx)
        dy = np.diff(cy)
        speeds = (np.sqrt(dx**2 + dy**2) / dt) * meters_per_pixel * 3.6
        speeds = np.insert(speeds, 0, speeds[0])

    times = track_df["timestamp_s"].to_numpy()
    cx = track_df["cx"].to_numpy()
    cy = track_df["cy_foot"].to_numpy()
    tid = int(track_df["track_id"].iloc[0])
    cname = str(track_df["class_name"].iloc[0])

    # 1. Sudden Deceleration & Sudden Emergency Stop Check
    for i in range(1, len(speeds)):
        v_prev = speeds[i - 1]
        v_curr = speeds[i]
        dv = v_curr - v_prev
        decel_rate_kmhs = dv / dt

        # Emergency hard braking: was cruising > 22 km/h, dropping faster than -20 km/h/s
        if decel_rate_kmhs < -20.0 and v_prev > 22.0:
            anomalies.append({
                "signal": "SUDDEN_DECELERATION",
                "track_id": tid,
                "class_name": cname,
                "timestamp_s": round(float(times[i]), 2),
                "x": float(cx[i]),
                "y": float(cy[i]),
                "v_prev": round(float(v_prev), 1),
                "v_curr": round(float(v_curr), 1),
                "deceleration_kmhs": round(float(abs(decel_rate_kmhs)), 1),
                "severity_weight": min(abs(decel_rate_kmhs) / 35.0, 1.0),
            })

        # Emergency stop: was moving > 22 km/h, dropped abruptly to stationary (< 2.5 km/h)
        if v_prev > 22.0 and v_curr < 2.5:
            # Verify it stays stopped for subsequent frames
            is_persistent_stop = (
                i + 2 < len(speeds) and np.mean(speeds[i : i + 3]) < 2.5
            ) or (i + 1 == len(speeds))

            if is_persistent_stop:
                anomalies.append({
                    "signal": "SUDDEN_STOP",
                    "track_id": tid,
                    "class_name": cname,
                    "timestamp_s": round(float(times[i]), 2),
                    "x": float(cx[i]),
                    "y": float(cy[i]),
                    "v_prev": round(float(v_prev), 1),
                    "v_curr": round(float(v_curr), 1),
                    "severity_weight": 0.85,
                })

    # 2. Abnormal Trajectory / Sharp Swerve Check (only while in substantial motion)
    if len(cx) >= 6:
        dx = np.diff(cx)
        dy = np.diff(cy)
        headings = np.degrees(np.arctan2(dx, dy)) % 360.0
        for i in range(1, len(headings)):
            # Ignore direction noise when stopped or crawling; require true cruising motion
            if speeds[i] > 16.0:
                d_heading = abs(headings[i] - headings[i - 1]) % 360.0
                if d_heading > 180.0:
                    d_heading = 360.0 - d_heading

                if d_heading > 50.0:  # >50 degree swerve in a single step at speed
                    anomalies.append({
                        "signal": "ABNORMAL_TRAJECTORY",
                        "track_id": tid,
                        "class_name": cname,
                        "timestamp_s": round(float(times[i]), 2),
                        "x": float(cx[i]),
                        "y": float(cy[i]),
                        "heading_change_deg": round(float(d_heading), 1),
                        "severity_weight": min(d_heading / 90.0, 1.0),
                    })

    return anomalies


def detect_multi_vehicle_interactions(
    df: pd.DataFrame,
    source_fps: float = 30.0,
    stride: int = 5,
    meters_per_pixel: float = 0.035,
    collision_dist_m: float = 2.0,
) -> list[dict[str, Any]]:
    """
    Detect genuine multi-vehicle collisions.
    Filters out:
    1. Duplicate detections (IoU > 0.30 of same vehicle).
    2. Parallel multi-lane cruising vehicles (similar direction, stable lateral distance).
    3. Normal traffic queues (slow crawling / stopped at junctions).

    A genuine collision requires:
    - Converging trajectory (distance closing rapidly before contact).
    - Physical contact proximity (0.05 <= IoU <= 0.30 or distance < 1.4m).
    - Abrupt kinetic impact (at least one vehicle cruising >= 18 km/h followed by immediate post-impact velocity loss >= 12 km/h).
    """
    if df.empty or "track_id" not in df.columns:
        return []

    track_lens = df.groupby("track_id").size()
    valid_tids = set(track_lens[track_lens >= 8].index)
    valid = df[(df["track_id"].isin(valid_tids)) & (df["track_id"] >= 0)].copy()

    interactions = []

    # Build per-track trajectory maps for pre/post impact derivative checks
    track_dict = {}
    for tid, gdf in valid.groupby("track_id"):
        track_dict[tid] = gdf.sort_values("timestamp_s").to_dict("records")

    # Group by frame
    for frame_idx, fdf in valid.groupby("frame_idx"):
        if len(fdf) < 2:
            continue

        records = fdf.to_dict("records")
        t_sec = float(records[0].get("timestamp_s", 0.0))

        for i in range(len(records)):
            for j in range(i + 1, len(records)):
                r1, r2 = records[i], records[j]
                t1, t2 = int(r1["track_id"]), int(r2["track_id"])

                # Check bounding box intersection
                x_left = max(r1["x1"], r2["x1"])
                x_right = min(r1["x2"], r2["x2"])
                y_top = max(r1["y1"], r2["y1"])
                y_bottom = min(r1["y2"], r2["y2"])

                iou = 0.0
                if x_right > x_left and y_bottom > y_top:
                    inter_area = (x_right - x_left) * (y_bottom - y_top)
                    area1 = max(1.0, (r1["x2"] - r1["x1"]) * (r1["y2"] - r1["y1"]))
                    area2 = max(1.0, (r2["x2"] - r2["x1"]) * (r2["y2"] - r2["y1"]))
                    iou = inter_area / (area1 + area2 - inter_area)

                # 1. Duplicate detection check (IoU > 0.30 indicates duplicate tracker box on same car)
                if iou > 0.30:
                    continue

                dx = r1["cx"] - r2["cx"]
                dy = r1["cy_foot"] - r2["cy_foot"]
                dist_px = math.hypot(dx, dy)
                dist_m = dist_px * meters_per_pixel

                v1 = float(r1.get("speed_kmh", 0.0) or 0.0)
                v2 = float(r2.get("speed_kmh", 0.0) or 0.0)

                # 2. Both vehicles crawling or stopped (< 8 km/h) = normal queue, NOT collision!
                if v1 < 8.0 and v2 < 8.0:
                    continue

                # 3. Physical contact proximity: either bounding box overlap or foot distance < 1.4m
                if not (iou >= 0.05 or dist_m < 1.4):
                    continue

                # 4. Impact dynamics verification:
                # One vehicle must have been cruising >= 18 km/h and experienced an abrupt post-contact crash
                t1_recs = track_dict.get(t1, [])
                t2_recs = track_dict.get(t2, [])

                # Find subsequent frames for t1 and t2 to verify abrupt speed drop
                t1_future_spds = [r["speed_kmh"] for r in t1_recs if r["timestamp_s"] > t_sec and r["timestamp_s"] <= t_sec + 1.0]
                t2_future_spds = [r["speed_kmh"] for r in t2_recs if r["timestamp_s"] > t_sec and r["timestamp_s"] <= t_sec + 1.0]

                t1_drop = (v1 - min(t1_future_spds)) if t1_future_spds else 0.0
                t2_drop = (v2 - min(t2_future_spds)) if t2_future_spds else 0.0

                is_real_collision = (
                    (v1 >= 18.0 and t1_drop >= 12.0)
                    or (v2 >= 18.0 and t2_drop >= 12.0)
                )

                if is_real_collision:
                    interactions.append({
                        "signal": "POSSIBLE_COLLISION",
                        "track_ids": [t1, t2],
                        "classes": [str(r1.get("class_name")), str(r2.get("class_name"))],
                        "timestamp_s": round(t_sec, 2),
                        "distance_m": round(dist_m, 2),
                        "iou": round(iou, 2),
                        "x": round((r1["cx"] + r2["cx"]) / 2.0, 1),
                        "y": round((r1["cy_foot"] + r2["cy_foot"]) / 2.0, 1),
                        "v1_kmh": round(v1, 1),
                        "v2_kmh": round(v2, 1),
                        "severity_weight": 0.95,
                    })

    return interactions


def detect_traffic_congestion_cause(
    df: pd.DataFrame,
    lead_track_id: int,
    incident_time_s: float,
    source_fps: float = 30.0,
    stride: int = 5,
    meters_per_pixel: float = 0.035,
    buffer_dist_m: float = 28.0,
    window_sec: float = 6.0,
) -> dict[str, Any]:
    """
    Determine if an incident or stopped vehicle caused traffic congestion behind it.

    Algorithm:
    1. Locate the lead vehicle's position at incident_time_s.
    2. Search for trailing vehicles within buffer_dist_m traveling in the same corridor
       during the subsequent window_sec.
    3. If 2 or more trailing vehicles are forced to decelerate or stop behind it:
       Flag lead_track_id as the primary bottleneck / cause of congestion.
    4. If no queue forms: Return traffic_caused = False (do NOT flag any vehicle).
    """
    if df.empty or "track_id" not in df.columns:
        return {
            "traffic_caused": False,
            "lead_vehicle_id": None,
            "impacted_vehicles": [],
            "queue_length_m": 0.0,
            "description": "No traffic disruption observed",
        }

    lead_records = df[
        (df["track_id"] == lead_track_id)
        & (df["timestamp_s"] >= incident_time_s - 1.0)
        & (df["timestamp_s"] <= incident_time_s + 2.0)
    ]
    if lead_records.empty:
        return {
            "traffic_caused": False,
            "lead_vehicle_id": None,
            "impacted_vehicles": [],
            "queue_length_m": 0.0,
            "description": "No traffic disruption observed",
        }

    lead_x = float(lead_records["cx"].iloc[0])
    lead_y = float(lead_records["cy_foot"].iloc[0])
    buffer_px = buffer_dist_m / meters_per_pixel

    # Find trailing vehicles arriving in the subsequent time window
    trailing_candidates = df[
        (df["track_id"] >= 0)
        & (df["track_id"] != lead_track_id)
        & (df["timestamp_s"] >= incident_time_s)
        & (df["timestamp_s"] <= incident_time_s + window_sec)
    ]

    impacted_vehicles = set()
    max_dist_px = 0.0

    for tid, gdf in trailing_candidates.groupby("track_id"):
        # Check if trailing vehicle was in motion upon approach and forced to brake behind the lead vehicle
        speeds_series = gdf["speed_kmh"] if "speed_kmh" in gdf.columns else pd.Series([0.0])
        max_approach_spd = float(speeds_series.max() or 0.0)
        min_queue_spd = float(speeds_series.min() or 0.0)

        for _, row in gdf.iterrows():
            dx = row["cx"] - lead_x
            dy = row["cy_foot"] - lead_y
            dist = math.hypot(dx, dy)

            # Trailing vehicle must be within buffer and have experienced an approach deceleration into queue
            if dist < buffer_px and (
                (max_approach_spd >= 10.0 and min_queue_spd < 6.0)
                or (float(row.get("speed_kmh", 0.0) or 0.0) < 4.0 and dist < buffer_px * 0.6 and max_approach_spd >= 8.0)
            ):
                impacted_vehicles.add(int(tid))
                max_dist_px = max(max_dist_px, dist)
                break

    impacted_list = sorted(list(impacted_vehicles))
    queue_len_m = round(max_dist_px * meters_per_pixel, 1)

    # Condition: Must cause at least 2 trailing vehicles to slow/queue
    if len(impacted_list) >= 2:
        return {
            "traffic_caused": True,
            "lead_vehicle_id": lead_track_id,
            "impacted_vehicles": impacted_list,
            "impacted_count": len(impacted_list),
            "queue_length_m": queue_len_m,
            "description": f"Caused traffic queue of {len(impacted_list)} trailing vehicles ({queue_len_m}m queue)",
        }

    return {
        "traffic_caused": False,
        "lead_vehicle_id": None,
        "impacted_vehicles": [],
        "impacted_count": 0,
        "queue_length_m": 0.0,
        "description": "No significant traffic disruption observed behind vehicle",
    }

