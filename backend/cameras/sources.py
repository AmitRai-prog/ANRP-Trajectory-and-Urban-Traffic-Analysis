"""
sources.py — VideoSource abstraction supporting local video files, RTSP streams, and demo feeds.
"""

from __future__ import annotations

import abc
import time
from pathlib import Path
from typing import Generator, Tuple

import cv2
import numpy as np


class VideoSource(abc.ABC):
    """Abstract interface for video ingestion."""

    @abc.abstractmethod
    def open(self) -> bool:
        """Open the video stream or file."""
        pass

    @abc.abstractmethod
    def read(self) -> Tuple[bool, np.ndarray | None]:
        """Read the next video frame."""
        pass

    @abc.abstractmethod
    def release(self) -> None:
        """Release underlying system resources."""
        pass

    @abc.abstractmethod
    def get_fps(self) -> float:
        """Return native or sampled FPS."""
        pass

    @abc.abstractmethod
    def get_resolution(self) -> Tuple[int, int]:
        """Return (width, height)."""
        pass

    @abc.abstractmethod
    def is_opened(self) -> bool:
        """Check if source is active."""
        pass

    def frames(self) -> Generator[Tuple[int, float, np.ndarray], None, None]:
        """Generator yielding (frame_index, timestamp_sec, frame_bgr)."""
        if not self.is_opened() and not self.open():
            return

        fps = self.get_fps() or 30.0
        frame_idx = 0
        try:
            while True:
                ok, frame = self.read()
                if not ok or frame is None:
                    break
                t_sec = frame_idx / fps
                yield frame_idx, t_sec, frame
                frame_idx += 1
        finally:
            self.release()


class FileVideoSource(VideoSource):
    """Reads a local video file (MP4, AVI, MOV)."""

    def __init__(self, file_path: str | Path):
        self.file_path = Path(file_path)
        self.cap: cv2.VideoCapture | None = None

    def open(self) -> bool:
        if not self.file_path.exists():
            return False
        self.cap = cv2.VideoCapture(str(self.file_path))
        return self.cap.isOpened()

    def read(self) -> Tuple[bool, np.ndarray | None]:
        if not self.cap or not self.cap.isOpened():
            return False, None
        return self.cap.read()

    def release(self) -> None:
        if self.cap:
            self.cap.release()
            self.cap = None

    def get_fps(self) -> float:
        if not self.cap:
            return 30.0
        fps = self.cap.get(cv2.CAP_PROP_FPS)
        return float(fps) if fps and fps > 0 else 30.0

    def get_resolution(self) -> Tuple[int, int]:
        if not self.cap:
            return 1920, 1080
        w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        return (w, h) if w > 0 and h > 0 else (1920, 1080)

    def is_opened(self) -> bool:
        return bool(self.cap and self.cap.isOpened())

    def get_frame_count(self) -> int:
        if not self.cap:
            return 0
        return int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)


class RTSPVideoSource(VideoSource):
    """Reads an IP / CCTV stream over RTSP with timeout and buffer handling."""

    def __init__(self, rtsp_url: str, timeout_sec: float = 8.0):
        self.rtsp_url = rtsp_url
        self.timeout_sec = timeout_sec
        self.cap: cv2.VideoCapture | None = None
        self._fps: float = 25.0
        self._res: Tuple[int, int] = (1920, 1080)

    def open(self) -> bool:
        # OpenCV flags to minimize latency and dropped packets on RTSP
        self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
        if not self.cap.isOpened():
            return False
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Real-time low-latency buffer
        fps = self.cap.get(cv2.CAP_PROP_FPS)
        if fps and fps > 0:
            self._fps = float(fps)
        w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if w > 0 and h > 0:
            self._res = (w, h)
        return True

    def read(self) -> Tuple[bool, np.ndarray | None]:
        if not self.cap or not self.cap.isOpened():
            return False, None
        return self.cap.read()

    def release(self) -> None:
        if self.cap:
            self.cap.release()
            self.cap = None

    def get_fps(self) -> float:
        return self._fps

    def get_resolution(self) -> Tuple[int, int]:
        return self._res

    def is_opened(self) -> bool:
        return bool(self.cap and self.cap.isOpened())


class DemoVideoSource(VideoSource):
    """
    Fallback demo source using local video assets or synthesized frames
    when live CCTV streams are not connected.
    """

    def __init__(self, fallback_path: str | Path | None = None, label: str = "CCTV_DEMO"):
        self.label = label
        self.fallback_path = Path(fallback_path) if fallback_path else None
        self._inner: VideoSource | None = None

    def open(self) -> bool:
        if self.fallback_path and self.fallback_path.exists():
            self._inner = FileVideoSource(self.fallback_path)
            return self._inner.open()
        return True  # Fallback to programmatic synthesis

    def read(self) -> Tuple[bool, np.ndarray | None]:
        if self._inner:
            ok, frame = self._inner.read()
            if ok and frame is not None:
                return ok, frame
            # Loop video
            self._inner.open()
            return self._inner.read()

        # Generate a synthetic 1080p frame with timestamp and watermark
        frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
        frame[:] = (24, 24, 27)  # Dark slate background
        cv2.putText(
            frame,
            f"LIVE STREAM: {self.label}",
            (50, 80),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.2,
            (56, 189, 248),
            2,
        )
        cv2.putText(
            frame,
            f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}",
            (50, 140),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (148, 163, 184),
            1,
        )
        return True, frame

    def release(self) -> None:
        if self._inner:
            self._inner.release()
            self._inner = None

    def get_fps(self) -> float:
        return self._inner.get_fps() if self._inner else 30.0

    def get_resolution(self) -> Tuple[int, int]:
        return self._inner.get_resolution() if self._inner else (1920, 1080)

    def is_opened(self) -> bool:
        return True
