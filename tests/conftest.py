"""Shared fixtures for the test suite."""

import pytest
import numpy as np
import cv2
from fastapi.testclient import TestClient
from api.main import app


@pytest.fixture
def client():
    """FastAPI TestClient bound to the app, for in-process HTTP calls."""
    return TestClient(app)


@pytest.fixture
def yarn_image_bytes():
    """PNG-encoded bytes of a 100x100 synthetic image with 3 solid color blocks."""
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img[0:33, :] = [255, 0, 0]
    img[33:66, :] = [0, 255, 0]
    img[66:100, :] = [0, 0, 255]

    success, buffer = cv2.imencode(".png", img)
    assert success, "Failed to encode test image"
    return buffer.tobytes()


@pytest.fixture
def garment_image_bytes():
    """PNG-encoded bytes of a 100x100 synthetic garment image (uniform grey)."""
    img = np.full((100, 100, 3), 128, dtype=np.uint8)
    success, buffer = cv2.imencode(".png", img)
    assert success, "Failed to encode test image"
    return buffer.tobytes()


@pytest.fixture
def mock_rembg(monkeypatch):
    """Replace rembg with a no-op that returns the input image with an opaque alpha channel.

    Why: rembg downloads a ~50MB U²-Net model on first use and runs ~1.8s per
    call. Mocking lets recolor tests run in milliseconds and keeps CI offline.
    The core.garment_recolor module lazy-imports `remove` and `new_session` via
    `from rembg import ...`, so patching the rembg module attributes directly
    intercepts them at import time.
    """
    import rembg

    def fake_remove(image, *args, **kwargs):
        h, w = image.shape[:2]
        alpha = np.full((h, w, 1), 255, dtype=np.uint8)
        if image.ndim == 3 and image.shape[2] == 3:
            return np.concatenate([image, alpha], axis=2)
        return image

    monkeypatch.setattr(rembg, "remove", fake_remove)
    monkeypatch.setattr(rembg, "new_session", lambda *args, **kwargs: None)
