"""
In-memory session store for garment recolouring.

A session holds a loaded garment image plus the rembg foreground mask so that
subsequent recolour calls can skip re-running rembg (~1.7 seconds and several
hundred megabytes of peak memory per call). Sessions are process-local; they
evaporate on Railway redeploy or after 30 minutes of idle time.

The recolour cache inside each session is a separate concern: it memoises the
recoloured PNG bytes keyed by the colour palette so flipping between yarns in
the frontend palette is instant after the first compute.

Architectural rationale (in-memory vs Redis, persistence vs caching, etc.) is
captured in docs/decisions/010-session-storage.md.
"""

import time
from dataclasses import dataclass, field
from typing import Optional
from uuid import uuid4

import numpy as np


SESSION_TTL_SECONDS = 30 * 60  # 30 minutes of idle time before eviction


@dataclass
class GarmentSession:
    """Per-garment server-side session.

    Holds the expensive-to-recompute artefacts (the loaded BGR image and the
    rembg foreground mask) plus a per-session cache of recoloured PNG bytes
    keyed by the colour palette that produced them.
    """

    session_id: str
    image: np.ndarray   # BGR uint8 garment image, downscaled
    mask: np.ndarray    # Foreground alpha mask from rembg, 2D uint8
    width: int
    height: int
    created_at: float
    last_accessed: float
    recolor_cache: dict[str, bytes] = field(default_factory=dict)


class SessionStore:
    """Process-local in-memory store for GarmentSession objects.

    Eviction is lazy: every public call sweeps for sessions whose
    last_accessed timestamp is older than ttl_seconds. There is no background
    sweep thread, so a stale session may live in memory until the next
    create() or get() call exercises the eviction path.

    Suitable for v2's single-process FastAPI deployment. If the API ever runs
    with multiple workers or replicas, swap this implementation for Redis (or
    similar) behind the same interface.
    """

    def __init__(self, ttl_seconds: int = SESSION_TTL_SECONDS):
        self._sessions: dict[str, GarmentSession] = {}
        self._ttl = ttl_seconds

    def create(self, image: np.ndarray, mask: np.ndarray) -> GarmentSession:
        """Register a freshly prepared (image, mask) pair and return the session."""
        self._evict_expired()
        height, width = image.shape[:2]
        now = time.time()
        session = GarmentSession(
            session_id=str(uuid4()),
            image=image,
            mask=mask,
            width=int(width),
            height=int(height),
            created_at=now,
            last_accessed=now,
        )
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> Optional[GarmentSession]:
        """Look up a session and refresh its last_accessed timestamp.

        Returns None if the session does not exist or has been evicted.
        """
        self._evict_expired()
        session = self._sessions.get(session_id)
        if session is not None:
            session.last_accessed = time.time()
        return session

    def _evict_expired(self) -> None:
        now = time.time()
        expired_ids = [
            sid
            for sid, s in self._sessions.items()
            if now - s.last_accessed > self._ttl
        ]
        for sid in expired_ids:
            del self._sessions[sid]

    def __len__(self) -> int:
        return len(self._sessions)


def make_recolor_cache_key(colors: list[str], weights: Optional[list[float]]) -> str:
    """Stable cache key for a (colours, weights) recolour input.

    Colours are normalised to lowercase so #FFAA00 and #ffaa00 hit the same
    cache entry. Weights are formatted to four decimal places for the same
    reason; floats with trailing zeros and floats like 0.30000000000000004
    would otherwise spawn duplicate cache entries for identical inputs.
    """
    weights_part = ",".join(f"{w:.4f}" for w in (weights or []))
    colors_part = ",".join(c.lower() for c in colors)
    return f"{colors_part}|{weights_part}"


# Module-level singleton. API endpoints import this directly.
session_store = SessionStore()
