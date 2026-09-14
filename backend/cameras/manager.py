"""
manager.py — Camera registry and source factory for Drone and CCTV devices.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from cameras.sources import VideoSource, FileVideoSource, RTSPVideoSource, DemoVideoSource
from database import get_all_cameras, get_camera, upsert_camera


@dataclass
class Camera:
    camera_id: str
    name: str
    camera_type: str  # 'drone' | 'cctv'
    location: str
    latitude: float
    longitude: float
    bearing: float = 0.0  # Heading direction in degrees (0 = North, 90 = East, etc.)
    coverage_radius_m: float = 100.0
    stream_url: str = ""
    status: str = "active"
    calibration: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "camera_id": self.camera_id,
            "name": self.name,
            "type": self.camera_type,
            "location": self.location,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "bearing": self.bearing,
            "coverage_radius_m": self.coverage_radius_m,
            "stream_url": self.stream_url,
            "status": self.status,
            "calibration": self.calibration,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Camera:
        calib = d.get("calibration_json") or d.get("calibration") or {}
        if isinstance(calib, str):
            try:
                calib = json.loads(calib)
            except Exception:
                calib = {}
        return cls(
            camera_id=d["camera_id"],
            name=d.get("name", d["camera_id"]),
            camera_type=d.get("type", "cctv"),
            location=d.get("location", "Unknown Location"),
            latitude=float(d.get("latitude", 0.0)),
            longitude=float(d.get("longitude", 0.0)),
            bearing=float(d.get("bearing", 0.0)),
            coverage_radius_m=float(d.get("coverage_radius_m", 100.0)),
            stream_url=d.get("stream_url", ""),
            status=d.get("status", "active"),
            calibration=calib,
        )


class CameraManager:
    """Manages camera metadata and builds active VideoSource streams."""

    @staticmethod
    def list_cameras() -> list[Camera]:
        records = get_all_cameras()
        return [Camera.from_dict(r) for r in records]

    @staticmethod
    def get_camera_by_id(camera_id: str) -> Camera | None:
        rec = get_camera(camera_id)
        return Camera.from_dict(rec) if rec else None

    @staticmethod
    def register_camera(cam: Camera) -> None:
        upsert_camera(cam.to_dict())

    @staticmethod
    def create_video_source(camera: Camera, fallback_video_path: Path | None = None) -> VideoSource:
        """Instantiate appropriate VideoSource for camera."""
        url = camera.stream_url.strip()

        if url.startswith("rtsp://") or url.startswith("rtsps://"):
            return RTSPVideoSource(url)
        elif url.startswith("http://") or url.startswith("https://"):
            # Could be HLS or HTTP-FLV, RTSPVideoSource handles standard ffmpeg URLs
            return RTSPVideoSource(url)
        elif url and Path(url).exists():
            return FileVideoSource(Path(url))
        elif fallback_video_path and fallback_video_path.exists():
            return FileVideoSource(fallback_video_path)
        else:
            # Prototype / Demo fallback
            return DemoVideoSource(fallback_video_path, label=camera.name)
