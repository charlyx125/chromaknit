"""Tests for the in-memory garment session store.

Covers create, get, sliding-TTL eviction, missing-session lookups, and the
recolour cache key normalisation.
"""

import time

import numpy as np
import pytest

from api.sessions import GarmentSession, SessionStore, make_recolor_cache_key


@pytest.fixture
def fake_image():
    """Small BGR image for session creation. Shape: (40, 60, 3)."""
    return np.full((40, 60, 3), 200, dtype=np.uint8)


@pytest.fixture
def fake_mask():
    """Matching foreground mask. Same height/width as fake_image."""
    return np.full((40, 60), 255, dtype=np.uint8)


class TestSessionStore:
    def test_create_returns_session_with_uuid_id_and_dimensions(self, fake_image, fake_mask):
        store = SessionStore(ttl_seconds=60)
        session = store.create(fake_image, fake_mask)

        assert isinstance(session, GarmentSession)
        assert session.session_id  # non-empty UUID string
        assert session.width == 60
        assert session.height == 40
        assert session.image is fake_image
        assert session.mask is fake_mask
        assert session.recolor_cache == {}

    def test_get_returns_previously_created_session(self, fake_image, fake_mask):
        store = SessionStore(ttl_seconds=60)
        created = store.create(fake_image, fake_mask)

        fetched = store.get(created.session_id)
        assert fetched is created

    def test_get_returns_none_for_unknown_id(self):
        store = SessionStore(ttl_seconds=60)
        assert store.get("does-not-exist") is None

    def test_get_refreshes_last_accessed_for_sliding_ttl(self, fake_image, fake_mask):
        store = SessionStore(ttl_seconds=60)
        session = store.create(fake_image, fake_mask)
        original = session.last_accessed

        time.sleep(0.01)
        store.get(session.session_id)
        assert session.last_accessed > original

    def test_expired_sessions_are_evicted_on_subsequent_calls(self, fake_image, fake_mask):
        # 0-second TTL means anything not in this exact tick is expired.
        store = SessionStore(ttl_seconds=0)
        session = store.create(fake_image, fake_mask)
        time.sleep(0.05)
        assert store.get(session.session_id) is None
        assert len(store) == 0

    def test_active_sessions_are_not_evicted(self, fake_image, fake_mask):
        store = SessionStore(ttl_seconds=60)
        session = store.create(fake_image, fake_mask)
        # Trigger eviction sweep via another call.
        store.create(fake_image, fake_mask)
        assert store.get(session.session_id) is session

    def test_recolor_cache_is_per_session(self, fake_image, fake_mask):
        store = SessionStore(ttl_seconds=60)
        a = store.create(fake_image, fake_mask)
        b = store.create(fake_image, fake_mask)
        a.recolor_cache["key-1"] = b"png-bytes-a"

        assert "key-1" not in b.recolor_cache
        assert a.recolor_cache["key-1"] == b"png-bytes-a"


class TestMakeRecolorCacheKey:
    def test_normalises_hex_case(self):
        # Same key regardless of the casing the caller used.
        upper = make_recolor_cache_key(["#FFAA00", "#000000"], None)
        lower = make_recolor_cache_key(["#ffaa00", "#000000"], None)
        assert upper == lower

    def test_includes_weights_in_key(self):
        with_weights = make_recolor_cache_key(["#ffaa00"], [0.5])
        no_weights = make_recolor_cache_key(["#ffaa00"], None)
        assert with_weights != no_weights

    def test_floating_point_precision_does_not_split_cache(self):
        # Both round to the same 4-decimal representation.
        a = make_recolor_cache_key(["#ffaa00"], [0.3])
        b = make_recolor_cache_key(["#ffaa00"], [0.30000000000000004])
        assert a == b

    def test_color_order_changes_key(self):
        # Brightness-banded recolour applies colours by sorted brightness, but
        # the cache should still treat order-different inputs as different so
        # the recolour engine can verify and recompute if needed.
        ab = make_recolor_cache_key(["#ff0000", "#00ff00"], None)
        ba = make_recolor_cache_key(["#00ff00", "#ff0000"], None)
        assert ab != ba
