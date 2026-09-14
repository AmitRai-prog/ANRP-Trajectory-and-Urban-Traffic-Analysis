"""
database.py — SQLite persistence layer for City-Wide Traffic Intelligence System.

Manages:
- Registered cameras (Drone and CCTV nodes)
- Incidents and anomalies
- Global vehicle identities (connecting local ByteTrack IDs)
- Camera observations and spatio-temporal trajectories
- ANPR / License plate detection records
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any
try:
    from config import DB_PATH
except ImportError:
    DB_PATH = Path(__file__).resolve().parent.parent / "data" / "traffic_system.db"


def get_db_path() -> Path:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return DB_PATH



def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(get_db_path()), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db() -> None:
    """Initialize all schema tables and populate default camera network."""
    conn = get_connection()
    cur = conn.cursor()

    # 1. Cameras table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cameras (
            camera_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('drone', 'cctv')),
            location TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            bearing REAL DEFAULT 0.0,
            coverage_radius_m REAL DEFAULT 100.0,
            stream_url TEXT,
            status TEXT DEFAULT 'active',
            calibration_json TEXT,
            created_at REAL NOT NULL
        );
    """)

    # 2. Incidents table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            incident_id TEXT PRIMARY KEY,
            camera_id TEXT NOT NULL,
            timestamp_s REAL NOT NULL,
            location_name TEXT NOT NULL,
            latitude REAL,
            longitude REAL,
            incident_type TEXT NOT NULL,
            severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
            confidence REAL NOT NULL,
            status TEXT DEFAULT 'open' CHECK(status IN ('open', 'investigating', 'resolved', 'dismissed')),
            details_json TEXT,
            created_at REAL NOT NULL,
            FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
        );
    """)

    # 3. Incident Tracks (many-to-many relationship linking local camera track_ids)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS incident_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            track_id INTEGER NOT NULL,
            role TEXT DEFAULT 'primary',
            FOREIGN KEY (incident_id) REFERENCES incidents(incident_id),
            FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
        );
    """)

    # 4. Global Vehicles (Cross-camera unified identity)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS global_vehicles (
            global_vehicle_id TEXT PRIMARY KEY,
            vehicle_class TEXT NOT NULL,
            plate_text TEXT,
            plate_confidence REAL DEFAULT 0.0,
            primary_color TEXT,
            created_at REAL NOT NULL
        );
    """)

    # 5. Camera Observations (Trajectory segments per camera)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS camera_observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            global_vehicle_id TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            local_track_id INTEGER NOT NULL,
            timestamp_start REAL NOT NULL,
            timestamp_end REAL NOT NULL,
            confidence REAL NOT NULL,
            metadata_json TEXT,
            FOREIGN KEY (global_vehicle_id) REFERENCES global_vehicles(global_vehicle_id),
            FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
        );
    """)

    # 6. ANPR Results
    cur.execute("""
        CREATE TABLE IF NOT EXISTS anpr_results (
            result_id TEXT PRIMARY KEY,
            global_vehicle_id TEXT,
            camera_id TEXT NOT NULL,
            track_id INTEGER NOT NULL,
            plate_text TEXT NOT NULL,
            confidence REAL NOT NULL,
            timestamp_s REAL NOT NULL,
            crop_path TEXT,
            FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
        );
    """)

    conn.commit()

    # Pre-seed default cameras if empty
    cur.execute("SELECT COUNT(*) as cnt FROM cameras;")
    if cur.fetchone()["cnt"] == 0:
        now = time.time()
        seed_cameras = [
            (
                "DRONE_01",
                "Pune Arterial Aerial Drone",
                "drone",
                "Pune Junction (18.5662N, 73.7718E)",
                18.566227,
                73.771846,
                204.7,
                250.0,
                "data/uploads/demo_traffic.mp4",
                "active",
                json.dumps({"altitude_m": 70.47, "pitch_deg": -63.1}),
                now,
            ),
            (
                "CCTV_01",
                "Westbound Approach Pole Cam",
                "cctv",
                "West Approach - Baner Arterial",
                18.565800,
                73.770500,
                85.0,
                80.0,
                "demo://cctv_01",
                "active",
                json.dumps({"fov_deg": 65, "resolution": "1920x1080"}),
                now,
            ),
            (
                "CCTV_02",
                "Eastbound Exit Pole Cam",
                "cctv",
                "East Exit - Croma Concourse",
                18.566800,
                73.773200,
                265.0,
                90.0,
                "demo://cctv_02",
                "active",
                json.dumps({"fov_deg": 70, "resolution": "1920x1080"}),
                now,
            ),
            (
                "CCTV_03",
                "North Cross-Street Connector",
                "cctv",
                "North Approach - Samsung Boulevard",
                18.567500,
                73.771800,
                180.0,
                75.0,
                "demo://cctv_03",
                "active",
                json.dumps({"fov_deg": 60, "resolution": "1920x1080"}),
                now,
            ),
        ]
        cur.executemany(
            """
            INSERT INTO cameras (
                camera_id, name, type, location, latitude, longitude,
                bearing, coverage_radius_m, stream_url, status, calibration_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            seed_cameras,
        )
        conn.commit()

    conn.close()


# ---------------------------------------------------------------------------
# Camera Operations
# ---------------------------------------------------------------------------

def get_all_cameras() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM cameras ORDER BY type DESC, camera_id ASC;").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_camera(camera_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM cameras WHERE camera_id = ?;", (camera_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_camera(cam: dict) -> None:
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO cameras (
            camera_id, name, type, location, latitude, longitude,
            bearing, coverage_radius_m, stream_url, status, calibration_json, created_at
        ) VALUES (:camera_id, :name, :type, :location, :latitude, :longitude,
                  :bearing, :coverage_radius_m, :stream_url, :status, :calibration_json, :created_at)
        ON CONFLICT(camera_id) DO UPDATE SET
            name=excluded.name,
            location=excluded.location,
            latitude=excluded.latitude,
            longitude=excluded.longitude,
            bearing=excluded.bearing,
            coverage_radius_m=excluded.coverage_radius_m,
            stream_url=excluded.stream_url,
            status=excluded.status,
            calibration_json=excluded.calibration_json;
        """,
        {
            "camera_id": cam["camera_id"],
            "name": cam.get("name", cam["camera_id"]),
            "type": cam.get("type", "cctv"),
            "location": cam.get("location", "Unknown"),
            "latitude": float(cam.get("latitude", 0.0)),
            "longitude": float(cam.get("longitude", 0.0)),
            "bearing": float(cam.get("bearing", 0.0)),
            "coverage_radius_m": float(cam.get("coverage_radius_m", 100.0)),
            "stream_url": cam.get("stream_url", ""),
            "status": cam.get("status", "active"),
            "calibration_json": json.dumps(cam.get("calibration", {})),
            "created_at": cam.get("created_at", time.time()),
        },
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Incident Operations
# ---------------------------------------------------------------------------

def save_incident(incident: dict) -> str:
    """Save or update an incident and its associated local track IDs."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO incidents (
            incident_id, camera_id, timestamp_s, location_name,
            latitude, longitude, incident_type, severity, confidence,
            status, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(incident_id) DO UPDATE SET
            severity=excluded.severity,
            confidence=excluded.confidence,
            status=excluded.status,
            details_json=excluded.details_json;
        """,
        (
            incident["incident_id"],
            incident["camera_id"],
            float(incident["timestamp_s"]),
            incident.get("location_name", "Pune Junction"),
            float(incident.get("latitude", 18.566227)),
            float(incident.get("longitude", 73.771846)),
            incident["incident_type"],
            incident.get("severity", "medium"),
            float(incident.get("confidence", 0.8)),
            incident.get("status", "open"),
            json.dumps(incident.get("details", {})),
            float(incident.get("created_at", time.time())),
        ),
    )

    # Insert involved tracks
    cur.execute("DELETE FROM incident_tracks WHERE incident_id = ?;", (incident["incident_id"],))
    for t in incident.get("involved_tracks", []):
        cur.execute(
            """
            INSERT INTO incident_tracks (incident_id, camera_id, track_id, role)
            VALUES (?, ?, ?, ?);
            """,
            (incident["incident_id"], incident["camera_id"], int(t.get("track_id", t) if isinstance(t, dict) else t), t.get("role", "primary") if isinstance(t, dict) else "primary"),
        )

    conn.commit()
    conn.close()
    return incident["incident_id"]


def get_all_incidents(status: str | None = None) -> list[dict]:
    conn = get_connection()
    if status:
        rows = conn.execute("SELECT * FROM incidents WHERE status = ? ORDER BY created_at DESC;", (status,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM incidents ORDER BY created_at DESC;").fetchall()

    result = []
    for r in rows:
        d = dict(r)
        d["details"] = json.loads(d.get("details_json") or "{}")
        # Load involved tracks
        tracks = conn.execute(
            "SELECT camera_id, track_id, role FROM incident_tracks WHERE incident_id = ?;",
            (d["incident_id"],),
        ).fetchall()
        d["involved_tracks"] = [dict(t) for t in tracks]
        result.append(d)

    conn.close()
    return result


def get_incident_by_id(incident_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM incidents WHERE incident_id = ?;", (incident_id,)).fetchone()
    if not row:
        conn.close()
        return None

    d = dict(row)
    d["details"] = json.loads(d.get("details_json") or "{}")
    tracks = conn.execute(
        "SELECT camera_id, track_id, role FROM incident_tracks WHERE incident_id = ?;",
        (incident_id,),
    ).fetchall()
    d["involved_tracks"] = [dict(t) for t in tracks]
    conn.close()
    return d


def update_incident_status(incident_id: str, status: str) -> None:
    conn = get_connection()
    conn.execute("UPDATE incidents SET status = ? WHERE incident_id = ?;", (status, incident_id))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Global Vehicle & Observation Operations
# ---------------------------------------------------------------------------

def upsert_global_vehicle(veh: dict) -> str:
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO global_vehicles (
            global_vehicle_id, vehicle_class, plate_text, plate_confidence, primary_color, created_at
        ) VALUES (:global_vehicle_id, :vehicle_class, :plate_text, :plate_confidence, :primary_color, :created_at)
        ON CONFLICT(global_vehicle_id) DO UPDATE SET
            plate_text=COALESCE(excluded.plate_text, global_vehicles.plate_text),
            plate_confidence=MAX(excluded.plate_confidence, global_vehicles.plate_confidence),
            primary_color=COALESCE(excluded.primary_color, global_vehicles.primary_color);
        """,
        {
            "global_vehicle_id": veh["global_vehicle_id"],
            "vehicle_class": veh.get("vehicle_class", "car"),
            "plate_text": veh.get("plate_text"),
            "plate_confidence": float(veh.get("plate_confidence", 0.0)),
            "primary_color": veh.get("primary_color", "unknown"),
            "created_at": veh.get("created_at", time.time()),
        },
    )
    conn.commit()
    conn.close()
    return veh["global_vehicle_id"]


def add_camera_observation(obs: dict) -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO camera_observations (
            global_vehicle_id, camera_id, local_track_id, timestamp_start, timestamp_end, confidence, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?);
        """,
        (
            obs["global_vehicle_id"],
            obs["camera_id"],
            int(obs["local_track_id"]),
            float(obs["timestamp_start"]),
            float(obs["timestamp_end"]),
            float(obs.get("confidence", 1.0)),
            json.dumps(obs.get("metadata", {})),
        ),
    )
    obs_id = cur.lastrowid
    conn.commit()
    conn.close()
    return obs_id


def get_global_vehicle_details(global_vehicle_id: str) -> dict | None:
    conn = get_connection()
    veh_row = conn.execute("SELECT * FROM global_vehicles WHERE global_vehicle_id = ?;", (global_vehicle_id,)).fetchone()
    if not veh_row:
        conn.close()
        return None

    veh = dict(veh_row)
    obs_rows = conn.execute(
        """
        SELECT o.*, c.name as camera_name, c.type as camera_type, c.location as camera_location
        FROM camera_observations o
        JOIN cameras c ON o.camera_id = c.camera_id
        WHERE o.global_vehicle_id = ?
        ORDER BY o.timestamp_start ASC;
        """,
        (global_vehicle_id,),
    ).fetchall()

    veh["observations"] = []
    for o in obs_rows:
        od = dict(o)
        od["metadata"] = json.loads(od.get("metadata_json") or "{}")
        veh["observations"].append(od)

    anpr_rows = conn.execute(
        "SELECT * FROM anpr_results WHERE global_vehicle_id = ? ORDER BY timestamp_s ASC;",
        (global_vehicle_id,),
    ).fetchall()
    veh["anpr_records"] = [dict(a) for a in anpr_rows]

    conn.close()
    return veh


def save_anpr_result(anpr: dict) -> str:
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO anpr_results (
            result_id, global_vehicle_id, camera_id, track_id, plate_text, confidence, timestamp_s, crop_path
        ) VALUES (:result_id, :global_vehicle_id, :camera_id, :track_id, :plate_text, :confidence, :timestamp_s, :crop_path)
        ON CONFLICT(result_id) DO UPDATE SET
            plate_text=excluded.plate_text,
            confidence=excluded.confidence;
        """,
        {
            "result_id": anpr["result_id"],
            "global_vehicle_id": anpr.get("global_vehicle_id"),
            "camera_id": anpr["camera_id"],
            "track_id": int(anpr["track_id"]),
            "plate_text": anpr["plate_text"],
            "confidence": float(anpr.get("confidence", 0.8)),
            "timestamp_s": float(anpr.get("timestamp_s", 0.0)),
            "crop_path": anpr.get("crop_path", ""),
        },
    )
    conn.commit()
    conn.close()
    return anpr["result_id"]
