"""
cameras package — Video sources, camera registry, and CCTV relevance selector.
"""

from cameras.sources import VideoSource, FileVideoSource, RTSPVideoSource, DemoVideoSource
from cameras.manager import Camera, CameraManager
from cameras.selector import select_relevant_cameras

__all__ = [
    "VideoSource",
    "FileVideoSource",
    "RTSPVideoSource",
    "DemoVideoSource",
    "Camera",
    "CameraManager",
    "select_relevant_cameras",
]
