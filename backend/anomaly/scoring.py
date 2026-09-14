"""
scoring.py — Explainable incident scoring engine (0-100) and incident record constructor.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import numpy as np
import pandas as pd

from anomaly.detector import (
    detect_track_anomalies,
    detect_multi_vehicle_interactions,
    detect_traffic_congestion_cause,
)
from config import INCIDENT_THRESHOLD


def compute_incident_score(
    signals: list[dict[str, Any]],
    weights: dict[str, float] | None = None,
) -> tuple[float, str, str]:
    """
    Compute explainable incident score (0-100), severity level, and description.

    Weights:
    - deceleration_score: max 25
    - stop_score: max 30
    - trajectory_score: max 20
    - proximity_score: max 25
    """
    if not signals:
        return 0.0, "low", "Normal Traffic"

    default_weights = {
        "SUDDEN_DECELERATION": 25.0,
        "SUDDEN_STOP": 30.0,
        "ABNORMAL_TRAJECTORY": 20.0,
        "POSSIBLE_COLLISION": 40.0,
        "TRAFFIC_PROPAGATION": 15.0,
    }
    w = weights or default_weights

    raw_score = 0.0
    for s in signals:
        sig_name = s.get("signal", "")
        sev_wt = float(s.get("severity_weight", 0.7))
        base_w = w.get(sig_name, 15.0)
        raw_score += base_w * sev_wt

    # Normalize to 0-100
    score = min(max(raw_score, 0.0), 100.0)

    # Plain-English risk and incident categorization:
    # Solitary stops or minor slowdowns must not be labeled critical collisions.
    has_collision_signal = any(s.get("signal") == "POSSIBLE_COLLISION" for s in signals)
    if score >= 80.0 and has_collision_signal:
        severity = "critical"
        level = "Suspected Collision"
    elif score >= 60.0:
        severity = "high"
        level = "High Risk / Possible Incident"
    elif score >= 40.0:
        severity = "medium"
        level = "Moderate Risk"
    else:
        severity = "low"
        level = "Normal"

    return round(score, 1), severity, level


def build_incidents_from_tracking(
    df: pd.DataFrame,
    camera_id: str = "DRONE_01",
    location_name: str = "Pune Junction Corridor",
    source_fps: float = 30.0,
    stride: int = 5,
    threshold: float = INCIDENT_THRESHOLD,
) -> list[dict[str, Any]]:
    """
    Analyze tracking dataframe, run anomaly detection, and return incident records >= threshold.
    """
    if df.empty:
        return []

    valid = df[df["track_id"] >= 0].copy()
    all_signals = []

    # 1. Single-track kinematic anomalies
    for tid, gdf in valid.groupby("track_id"):
        track_sigs = detect_track_anomalies(gdf, source_fps=source_fps, stride=stride)
        all_signals.extend(track_sigs)

    # 2. Multi-vehicle collision & interaction anomalies
    multi_sigs = detect_multi_vehicle_interactions(valid, source_fps=source_fps, stride=stride)
    all_signals.extend(multi_sigs)

    if not all_signals:
        return []

    # Cluster signals that occur within spatial (<100 px) and temporal (<2.5s) proximity
    clusters: list[list[dict[str, Any]]] = []
    for s in all_signals:
        assigned = False
        for c in clusters:
            t_diff = abs(s["timestamp_s"] - c[0]["timestamp_s"])
            dist = np.hypot(s["x"] - c[0]["x"], s["y"] - c[0]["y"])
            # Require temporal proximity and close spatial radius
            if t_diff < 2.5 and dist < 100.0:
                c.append(s)
                assigned = True
                break
        if not assigned:
            clusters.append([s])

    raw_incidents = []
    for idx, c in enumerate(clusters):
        score, severity, level = compute_incident_score(c)

        if score < threshold:
            continue

        signals_present = list({s["signal"] for s in c})
        has_collision_signal = "POSSIBLE_COLLISION" in signals_present

        t_sec = float(c[0]["timestamp_s"])
        avg_x = float(np.mean([s["x"] for s in c]))
        avg_y = float(np.mean([s["y"] for s in c]))

        # CRITICAL: Verify that involved vehicle(s) actually exist in the footage at t_sec!
        active_in_frame = valid[
            (valid["timestamp_s"] >= t_sec - 0.6)
            & (valid["timestamp_s"] <= t_sec + 0.6)
        ]

        if active_in_frame.empty:
            # If no vehicle is visible on screen around this timestamp, discard phantom detection
            continue

        # Extract track IDs that generated the anomaly signals
        signal_tids = []
        for s in c:
            if "track_id" in s:
                signal_tids.append(int(s["track_id"]))
            if "track_ids" in s:
                signal_tids.extend([int(x) for x in s["track_ids"]])

        # Keep only tracks that are actually visible on screen at this exact timestamp
        active_tids = set(active_in_frame["track_id"].unique())
        verified_tids = [tid for tid in signal_tids if tid in active_tids]

        if verified_tids:
            # The primary vehicle is the most frequently signaled active track in this cluster
            from collections import Counter
            primary_tid = Counter(verified_tids).most_common(1)[0][0]
        else:
            # Fallback to the active vehicle physically closest to the anomaly position
            dists = np.hypot(active_in_frame["cx"] - avg_x, active_in_frame["cy_foot"] - avg_y)
            closest_idx = dists.idxmin()
            primary_tid = int(active_in_frame.loc[closest_idx, "track_id"])

        # Fetch verified primary vehicle telemetry at this timestamp
        primary_rows = active_in_frame[active_in_frame["track_id"] == primary_tid]
        if primary_rows.empty:
            continue
        primary_row = primary_rows.iloc[0]
        primary_x = float(primary_row["cx"])
        primary_y = float(primary_row["cy_foot"])
        primary_class = str(primary_row.get("class_name", "car"))

        # Find verified secondary vehicles physically adjacent (< 10m / 285px) at t_sec
        secondary_tids = []
        for tid in set(verified_tids):
            if tid != primary_tid:
                sec_rows = active_in_frame[active_in_frame["track_id"] == tid]
                if not sec_rows.empty:
                    s_row = sec_rows.iloc[0]
                    dist_to_prim = np.hypot(s_row["cx"] - primary_x, s_row["cy_foot"] - primary_y)
                    if dist_to_prim < 285.0:  # within 10 meters
                        secondary_tids.append(tid)

        # Determine primary incident type title
        if has_collision_signal:
            inc_type = "Possible Collision"
        elif "SUDDEN_STOP" in signals_present and "SUDDEN_DECELERATION" in signals_present:
            inc_type = "Sudden Deceleration & Stop"
        elif "SUDDEN_STOP" in signals_present:
            inc_type = "Stationary Road Obstacle / Sudden Stop"
        elif "ABNORMAL_TRAJECTORY" in signals_present:
            inc_type = "Abnormal Swerve / Erratic Trajectory"
        else:
            inc_type = "Traffic Kinematic Anomaly"

        # Heading estimation
        vehicle_heading = 90.0
        for s in c:
            if "heading_change_deg" in s:
                vehicle_heading = float(s["heading_change_deg"])
                break

        inc_id = f"INC_{str(uuid.uuid4())[:6].upper()}"

        # Traffic congestion attribution check
        congestion = {
            "traffic_caused": False,
            "lead_vehicle_id": None,
            "impacted_vehicles": [],
            "impacted_count": 0,
            "queue_length_m": 0.0,
            "description": "No traffic congestion observed",
        }
        try:
            congestion = detect_traffic_congestion_cause(
                valid,
                lead_track_id=primary_tid,
                incident_time_s=t_sec,
                source_fps=source_fps,
                stride=stride,
            )
        except Exception:
            pass

        # Significance criteria: requires score >= 70.0 AND (verified collision OR caused congestion queue)
        is_significant = bool(score >= 70.0 and (has_collision_signal or congestion.get("traffic_caused")))
        requires_cctv = is_significant

        involved_list = [{"track_id": primary_tid, "role": "primary", "class_name": primary_class}]
        for stid in secondary_tids:
            sec_rows = active_in_frame[active_in_frame["track_id"] == stid]
            sec_cls = str(sec_rows.iloc[0].get("class_name", "vehicle")) if not sec_rows.empty else "vehicle"
            involved_list.append({"track_id": stid, "role": "secondary", "class_name": sec_cls})

        incident = {
            "incident_id": inc_id,
            "camera_id": camera_id,
            "timestamp_s": round(t_sec, 2),
            "location_name": location_name,
            "latitude": 18.566227,
            "longitude": 73.771846,
            "incident_type": inc_type,
            "severity": severity,
            "confidence": round(score / 100.0, 2),
            "status": "open",
            "requires_cctv": requires_cctv,
            "is_significant": is_significant,
            "lead_bottleneck_vehicle_id": congestion.get("lead_vehicle_id") if congestion.get("traffic_caused") else None,
            "congestion_attribution": congestion,
            "involved_tracks": involved_list,
            "details": {
                "score": score,
                "level": level,
                "signals": signals_present,
                "classes": list({primary_class} | {inv.get("class_name", "") for inv in involved_list if inv.get("class_name")}),
                "position_px": {"x": round(primary_x, 1), "y": round(primary_y, 1)},
                "vehicle_heading_deg": vehicle_heading,
                "congestion": congestion,
                "evidence": [
                    {
                        "signal": s.get("signal"),
                        "track_id": s.get("track_id") or s.get("track_ids"),
                        "timestamp_s": s.get("timestamp_s"),
                        "details": {k: v for k, v in s.items() if k not in ("signal", "x", "y")},
                    }
                    for s in c[:5]
                ],
            },
            "created_at": time.time(),
        }
        raw_incidents.append(incident)

    # STRICT RANKING & DEDUPLICATION:
    # 1. Sort descending by score and confidence
    raw_incidents.sort(key=lambda x: (x["details"]["score"], x["confidence"]), reverse=True)

    # 2. Suppress duplicate echoes within 3.0s and 60m of a higher-ranking incident
    ranked_incidents = []
    for cand in raw_incidents:
        is_duplicate = False
        cand_t = cand["timestamp_s"]
        cand_x = cand["details"]["position_px"]["x"]
        cand_y = cand["details"]["position_px"]["y"]

        for existing in ranked_incidents:
            t_diff = abs(cand_t - existing["timestamp_s"])
            dist = np.hypot(cand_x - existing["details"]["position_px"]["x"], cand_y - existing["details"]["position_px"]["y"])
            if t_diff < 3.0 and dist < 180.0:
                is_duplicate = True
                break

        if not is_duplicate:
            cand["rank"] = len(ranked_incidents) + 1
            ranked_incidents.append(cand)

    return ranked_incidents
