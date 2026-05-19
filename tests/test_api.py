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


def test_extract_colors_rejects_decompression_bomb(client, dimension_bomb_image_bytes):
    """A small file with huge declared dimensions returns 413 before cv2 decodes.

    Guards SECURITY.md section 3: a uniform-content PNG with 27.5 megapixels
    of declared size compresses to well under the 5 MB upload cap but would
    decode to ~140 MB of raw pixels and risks OOMing the container. The
    validate_image_dimensions header-only check must reject it before cv2.imread
    is called.
    """
    response = client.post(
        "/api/colors/extract",
        files={"file": ("bomb.png", dimension_bomb_image_bytes, "image/png")},
    )

    assert response.status_code == 413
    detail = response.json()["detail"].lower()
    assert "dimensions" in detail
    assert "megapixels" in detail


# ============================================================================
# POST /api/garments/session
# ============================================================================
# v2 splits the legacy "upload + recolour in one shot" endpoint into two
# stages. Tests below exercise both halves and the cache between them.


def _create_session(client, image_bytes):
    """Helper: upload a garment and return the parsed session response body."""
    response = client.post(
        "/api/garments/session",
        files={"file": ("garment.png", image_bytes, "image/png")},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_create_session_happy_path(client, garment_image_bytes, mock_rembg):
    """Valid garment upload returns 200 with a session_id, dimensions, and mask."""
    body = _create_session(client, garment_image_bytes)

    assert isinstance(body["session_id"], str) and body["session_id"]
    assert body["width"] > 0
    assert body["height"] > 0
    # Foreground mask is a base64 string; the frontend uses it to clip paint
    # strokes to the garment outline.
    assert isinstance(body["mask_png_b64"], str)
    assert len(body["mask_png_b64"]) > 0


def test_create_session_rejects_non_image_content_type(client, mock_rembg):
    """Non-image content type returns 400 before any processing."""
    response = client.post(
        "/api/garments/session",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400
    assert "text/plain" in response.json()["detail"]


def test_create_session_rejects_oversized_file(client):
    """A garment file larger than MAX_FILE_SIZE (5MB) returns 413."""
    oversized_payload = b"\x00" * (6 * 1024 * 1024)

    response = client.post(
        "/api/garments/session",
        files={"file": ("huge.png", oversized_payload, "image/png")},
    )
    assert response.status_code == 413


def test_create_session_rejects_decompression_bomb(
    client, dimension_bomb_image_bytes, mock_rembg
):
    """A garment upload with huge declared dimensions returns 413 before rembg runs.

    Guards SECURITY.md section 3. Parallels test_extract_colors_rejects_decompression_bomb
    for the second upload endpoint.
    """
    response = client.post(
        "/api/garments/session",
        files={"file": ("bomb.png", dimension_bomb_image_bytes, "image/png")},
    )

    assert response.status_code == 413
    detail = response.json()["detail"].lower()
    assert "dimensions" in detail
    assert "megapixels" in detail


# ============================================================================
# POST /api/garments/recolor (session-keyed)
# ============================================================================

def test_recolor_garment_happy_path(client, garment_image_bytes, mock_rembg):
    """Session + colors returns 200 with a PNG body."""
    session = _create_session(client, garment_image_bytes)

    response = client.post(
        "/api/garments/recolor",
        data={
            "session_id": session["session_id"],
            "colors": '["#FF0000", "#00FF00", "#0000FF"]',
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert len(response.content) > 0
    assert response.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_recolor_garment_returns_404_for_unknown_session(client, mock_rembg):
    """A session_id that was never created (or has been evicted) returns 404."""
    response = client.post(
        "/api/garments/recolor",
        data={
            "session_id": "definitely-not-a-real-session-id",
            "colors": '["#FF0000"]',
        },
    )

    assert response.status_code == 404
    assert "session" in response.json()["detail"].lower()


def test_recolor_garment_caches_identical_inputs(client, garment_image_bytes, mock_rembg):
    """Same session + same colours returns identical bytes from the cache."""
    session = _create_session(client, garment_image_bytes)
    payload = {
        "session_id": session["session_id"],
        "colors": '["#FF0000", "#00FF00", "#0000FF"]',
    }

    first = client.post("/api/garments/recolor", data=payload)
    second = client.post("/api/garments/recolor", data=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.content == second.content


def test_recolor_garment_rejects_malformed_json_colors(
    client, garment_image_bytes, mock_rembg
):
    """A colors value shaped like a JSON array but not parseable returns 400."""
    session = _create_session(client, garment_image_bytes)
    response = client.post(
        "/api/garments/recolor",
        data={
            "session_id": session["session_id"],
            "colors": "[not valid json]",
        },
    )

    assert response.status_code == 400
    assert "invalid color format" in response.json()["detail"].lower()


def test_recolor_garment_rejects_invalid_hex_colors(
    client, garment_image_bytes, mock_rembg
):
    """A parseable colors value with non-hex strings returns 400."""
    session = _create_session(client, garment_image_bytes)
    response = client.post(
        "/api/garments/recolor",
        data={
            "session_id": session["session_id"],
            "colors": '["not-a-hex", "also-not-hex"]',
        },
    )

    assert response.status_code == 400
    assert "invalid hex color format" in response.json()["detail"].lower()


def test_recolor_garment_rejects_empty_color_list(
    client, garment_image_bytes, mock_rembg
):
    """An empty JSON color array returns 400."""
    session = _create_session(client, garment_image_bytes)
    response = client.post(
        "/api/garments/recolor",
        data={
            "session_id": session["session_id"],
            "colors": "[]",
        },
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
