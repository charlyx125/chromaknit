"""API endpoint tests using FastAPI TestClient."""

import asyncio
import re
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from api.main import save_upload_capped

HEX_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")


# ============================================================================
# GET / and /health
# ============================================================================

def test_root_endpoint_returns_api_info(client):
    """Root endpoint returns welcome payload with endpoint directory."""
    response = client.get("/")

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "Welcome to ChromaKnit API!"
    assert "endpoints" in body
    assert body["endpoints"]["health"] == "/health"


def test_health_endpoint_reports_healthy(client):
    """Health check returns status=healthy."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_unknown_endpoint_returns_custom_404(client):
    """Unknown routes return the custom 404 JSON shape, not FastAPI's default."""
    response = client.get("/this-route-does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["error"] == "Endpoint not found"
    assert "message" in body


# ============================================================================
# POST /api/colors/extract
# ============================================================================

def test_extract_colors_happy_path(client, yarn_image_bytes):
    """Valid image upload returns 200 with the requested number of hex colors."""
    response = client.post(
        "/api/colors/extract",
        files={"file": ("yarn.png", yarn_image_bytes, "image/png")},
        data={"n_colors": 3},
    )

    assert response.status_code == 200

    body = response.json()
    assert body["success"] is True
    assert body["count"] == 3
    assert len(body["colors"]) == 3
    assert len(body["percentages"]) == 3
    assert body["filename"] == "yarn.png"

    for color in body["colors"]:
        assert HEX_PATTERN.match(color), f"Invalid hex color: {color}"

    assert abs(sum(body["percentages"]) - 1.0) < 0.01


def test_extract_colors_rejects_non_image_content_type(client):
    """Uploading a non-image content type returns 400 with a descriptive error."""
    response = client.post(
        "/api/colors/extract",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 400
    assert "text/plain" in response.json()["detail"]


def test_extract_colors_rejects_corrupt_image(client):
    """An image/* content type with unparseable bytes returns 400."""
    response = client.post(
        "/api/colors/extract",
        files={"file": ("broken.png", b"not a real image", "image/png")},
    )

    assert response.status_code == 400
    assert "corrupted" in response.json()["detail"].lower() or "invalid" in response.json()["detail"].lower()


def test_extract_colors_rejects_oversized_file(client):
    """A file larger than MAX_FILE_SIZE (5MB) returns 413."""
    oversized_payload = b"\x00" * (6 * 1024 * 1024)

    response = client.post(
        "/api/colors/extract",
        files={"file": ("huge.png", oversized_payload, "image/png")},
    )

    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()


# ============================================================================
# POST /api/garments/recolor
# ============================================================================

def test_recolor_garment_happy_path(client, garment_image_bytes, mock_rembg):
    """Valid garment + colors returns 200 with a PNG body."""
    response = client.post(
        "/api/garments/recolor",
        files={"file": ("garment.png", garment_image_bytes, "image/png")},
        data={"colors": '["#FF0000", "#00FF00", "#0000FF"]'},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert len(response.content) > 0
    assert response.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_recolor_garment_rejects_malformed_json_colors(client, garment_image_bytes, mock_rembg):
    """A colors value shaped like a JSON array but not parseable returns 400 from the JSON branch."""
    response = client.post(
        "/api/garments/recolor",
        files={"file": ("garment.png", garment_image_bytes, "image/png")},
        data={"colors": "[not valid json]"},
    )

    assert response.status_code == 400
    assert "invalid color format" in response.json()["detail"].lower()


def test_recolor_garment_rejects_invalid_hex_colors(client, garment_image_bytes, mock_rembg):
    """A parseable colors value with non-hex strings returns 400 from the hex-validation branch."""
    response = client.post(
        "/api/garments/recolor",
        files={"file": ("garment.png", garment_image_bytes, "image/png")},
        data={"colors": '["not-a-hex", "also-not-hex"]'},
    )

    assert response.status_code == 400
    assert "invalid hex color format" in response.json()["detail"].lower()


def test_recolor_garment_rejects_non_image_content_type(client, mock_rembg):
    """Uploading a non-image content type to recolor returns 400."""
    response = client.post(
        "/api/garments/recolor",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"colors": '["#FF0000"]'},
    )

    assert response.status_code == 400
    assert "text/plain" in response.json()["detail"]


def test_recolor_garment_rejects_oversized_file(client):
    """A garment file larger than MAX_FILE_SIZE (5MB) returns 413."""
    oversized_payload = b"\x00" * (6 * 1024 * 1024)

    response = client.post(
        "/api/garments/recolor",
        files={"file": ("huge.png", oversized_payload, "image/png")},
        data={"colors": '["#FF0000"]'},
    )

    assert response.status_code == 413


def test_recolor_garment_rejects_empty_color_list(client, garment_image_bytes, mock_rembg):
    """An empty JSON color array returns 400."""
    response = client.post(
        "/api/garments/recolor",
        files={"file": ("garment.png", garment_image_bytes, "image/png")},
        data={"colors": "[]"},
    )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


# ============================================================================
# Unit test: save_upload_capped streaming cap
# ============================================================================

def test_save_upload_capped_aborts_on_oversized_stream():
    """Streaming path raises 413 when cumulative bytes exceed max_bytes.

    Why a unit test and not a TestClient test: when TestClient sends a file,
    the multipart parser populates UploadFile.size, which triggers the fast
    Content-Length check before the streaming cap runs. To exercise the
    streaming cap path (the authoritative check when Content-Length is absent
    or spoofed — guards commit 48967e2), we call save_upload_capped directly
    with a mock UploadFile that reports no size and streams chunks on read().
    """
    chunks = [b"x" * 512, b"x" * 512, b"x" * 512, b""]
    mock_file = MagicMock()
    mock_file.read = AsyncMock(side_effect=chunks)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(save_upload_capped(mock_file, max_bytes=1024, suffix=".jpg"))

    assert exc_info.value.status_code == 413
    assert "too large" in exc_info.value.detail.lower()
