"""
ChromaKnit API - Color extraction and garment recoloring endpoints

REST API Patterns:
- GET:  Client ← Server ("Give me data")
- POST: Client → Server ("Here's data, process it")
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response, JSONResponse
import asyncio
import json
import logging
import re
import tempfile
import os
import cv2
from PIL import Image as PILImage, UnidentifiedImageError
from core.log_config import setup_logging
from core.yarn_color_extractor import ColorExtractor
from core.garment_recolor import GarmentRecolorer
from api.sessions import session_store, make_recolor_cache_key
from fastapi.middleware.cors import CORSMiddleware

setup_logging()
logger = logging.getLogger(__name__)

HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

MAX_IMAGE_DIMENSION = 800
UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1MB
MAX_IMAGE_PIXELS = 25_000_000  # 25 megapixels; see validate_image_dimensions
DEFAULT_OPERATION_TIMEOUT_SECONDS = 30.0


async def save_upload_capped(file: UploadFile, max_bytes: int, suffix: str) -> str:
    """Stream an UploadFile to a new tempfile, aborting if the cap is exceeded.

    Returns the path to the temp file. On overage or any other exception during
    read/write, unlinks the partial file before propagating. Handles the case
    where Content-Length is missing or untrustworthy — a raw file.size check
    can be spoofed or absent for multipart uploads.
    """
    fd, temp_path = tempfile.mkstemp(suffix=suffix)
    try:
        bytes_read = 0
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await file.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                bytes_read += len(chunk)
                if bytes_read > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum allowed: {max_bytes // (1024 * 1024)}MB."
                    )
                out.write(chunk)
        return temp_path
    except BaseException:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise


async def run_in_thread_with_timeout(func, *args, timeout: float | None = None, **kwargs):
    """Run a sync CPU-bound function in a thread, abort the await on timeout.

    Returns the function's result, or raises HTTPException(408) if the deadline
    fires first. Honest caveat: Python cannot preempt running sync code, so the
    timeout only frees the request handler (returns 408, releases the event
    loop). The underlying thread keeps running to completion in the default
    executor's pool. On a single Uvicorn worker this still buys availability
    because the event loop unblocks and can accept new requests while the
    zombie thread finishes; the protection saturates once the thread pool is
    exhausted (~8 default threads), at which point further uploads queue.

    Reads DEFAULT_OPERATION_TIMEOUT_SECONDS at call time (not as a default-arg
    snapshot) so tests can monkeypatch the constant to tighten the deadline.

    See SECURITY.md section 5 (per-operation timeouts).
    """
    effective_timeout = (
        timeout if timeout is not None else DEFAULT_OPERATION_TIMEOUT_SECONDS
    )
    loop = asyncio.get_running_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, lambda: func(*args, **kwargs)),
            timeout=effective_timeout,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=408,
            detail=(
                f"Operation timed out after {effective_timeout:.0f}s. "
                "Try a smaller image or retry."
            ),
        )


def validate_image_dimensions(path: str) -> None:
    """Reject images whose decoded dimensions would exceed MAX_IMAGE_PIXELS.

    Header-only check via PIL: opens the file but does not call .load(), so
    pixel data is never decoded. A 5 MB compressed PNG can decode to 800+ MB
    of raw pixels (uniform content compresses extremely well), enough to OOM
    a 2 GB HF Spaces container. This guard runs before cv2.imread() so the
    bytes never reach a full decode.

    See SECURITY.md section 3 (image decompression bombs).
    """
    try:
        with PILImage.open(path) as img:
            width, height = img.size
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="Invalid image file: could not read header.",
        )

    if width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Image dimensions too large ({width}x{height}). "
                f"Maximum: {MAX_IMAGE_PIXELS // 1_000_000} megapixels."
            ),
        )


# Initialize FastAPI application
app = FastAPI(
    title="ChromaKnit API",
    description="Extract colors from yarn and recolor garments",
    version="2.0.0"
)

# CORS configuration - allow both production and development origins
origins = [
    "https://chromaknit.vercel.app",
    "https://chromaknit-git-main-charlyx125.vercel.app",
    "https://chromaknit-charlyx125.vercel.app",
    # Vercel preview deploys for the multi-yarn branch (and any future branch)
    # share the same shape; add a regex if more branches need previewing.
    "https://chromaknit-git-multi-yarn-charlyx125.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    # HuggingFace Spaces hosts the backend. The parent dashboard origin is
    # huggingface.co; the Space itself serves on its own hf.space subdomain.
    # Both are listed so the Swagger docs and Space preview work without
    # cross-origin surprises during smoke tests.
    "https://huggingface.co",
    "https://charlyx125-chromaknit-backend.hf.space",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB in bytes


def downscale_image(path: str, max_dim: int = MAX_IMAGE_DIMENSION) -> None:
    """Downscale image on disk if it exceeds max_dim. Reduces memory usage for processing."""
    img = cv2.imread(path)
    if img is None:
        return
    h, w = img.shape[:2]
    if max(h, w) <= max_dim:
        return
    scale = max_dim / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    cv2.imwrite(path, img)


# ============================================================================
# BASIC ENDPOINTS
# ============================================================================

@app.get("/")
def read_root():
    """Root endpoint - API welcome message"""
    return {
        "message": "Welcome to ChromaKnit API!",
        "version": "2.0.0",
        "endpoints": {
            "docs": "/docs",
            "health": "/health",
            "color_extraction": "/api/colors/extract",
            "garment_recoloring": "/api/garments/recolor"
        }
    }


@app.get("/health")
def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "version": "2.0.0"
    }


# ============================================================================
# COLOR EXTRACTION ENDPOINT
# ============================================================================

@app.post("/api/colors/extract")
async def extract_colors(
    file: UploadFile = File(..., description="Yarn image file (JPG, PNG)"),
    n_colors: int = Form(default=5, ge=1, le=10, description="Number of colors to extract")
):
    """
    Extract dominant colors from uploaded yarn image using K-means clustering.
    
    **Process:**
    1. Validates file type and size
    2. Extracts dominant colors using K-means
    3. Returns sorted color palette (by frequency)
    
    **Parameters:**
    - **file**: Image file of yarn (JPG, PNG format)
    - **n_colors**: Number of dominant colors to extract (1-10, default: 5)
    
    **Returns:**
    - JSON with color array in hex format
    
    **Example Response:**
```json
    {
        "success": true,
        "colors": ["#142a68", "#23438d", "#0c153b"],
        "count": 3,
        "filename": "yarn.jpg"
    }
```
    """
    
    # Validation 1: File type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Please upload an image (JPG, PNG)."
        )
    
    # Validation 2: File size — fast reject when Content-Length is advertised.
    # Streaming cap below is the authoritative check (Content-Length can be
    # absent or wrong).
    if file.size and file.size > MAX_FILE_SIZE:
        size_mb = file.size / (1024 * 1024)
        raise HTTPException(
            status_code=413,  # Payload Too Large
            detail=f"File too large: {size_mb:.2f}MB. Maximum allowed: 5MB."
        )

    temp_path = await save_upload_capped(file, MAX_FILE_SIZE, ".jpg")

    try:
        validate_image_dimensions(temp_path)
        await run_in_thread_with_timeout(downscale_image, temp_path, max_dim=400)
        extractor = ColorExtractor(image_path=temp_path, n_colors=n_colors)
        colors = await run_in_thread_with_timeout(extractor.extract_dominant_colors)
        
        # Validation 3: Check if extraction succeeded
        if not colors:
            raise HTTPException(
                status_code=400,
                detail="Could not extract colors from image. The file may be corrupted or invalid."
            )
        
        # Calculate percentages from pixel counts
        total_pixels = extractor.counts.sum()
        percentages = [round(float(c) / total_pixels, 4) for c in extractor.counts]

        return {
            "success": True,
            "colors": colors,
            "percentages": percentages,
            "count": len(colors),
            "filename": file.filename
        }
    
    finally:
        # Clean up temporary file
        if os.path.exists(temp_path):
            os.unlink(temp_path)


# ============================================================================
# GARMENT RECOLORING (session-keyed)
# ============================================================================
#
# v2 splits the old "upload + recolour in one shot" endpoint into two:
#
#   POST /api/garments/session  uploads the file once, runs rembg, returns a
#                               session_id. The image and mask stay in memory
#                               on the server for 30 minutes of idle time.
#
#   POST /api/garments/recolor  takes a session_id plus a colour palette and
#                               returns the recoloured PNG. Result is cached
#                               per (session, colours) so flipping yarns in
#                               the frontend palette is instant after the
#                               first compute.
#
# See docs/decisions/010-session-storage.md for the architectural rationale.

def _parse_color_list(colors: str) -> list[str]:
    """Parse a JSON array or comma-separated list of hex colours.

    Validates that the result is a non-empty list of #RRGGBB strings and
    raises HTTPException(400) on any failure mode.
    """
    try:
        colors_trimmed = colors.strip()
        if colors_trimmed.startswith("[") and colors_trimmed.endswith("]"):
            color_list = json.loads(colors_trimmed)
        else:
            color_list = [c.strip() for c in colors_trimmed.split(",") if c.strip()]
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                'Invalid color format. Use either:\n'
                '- JSON array: ["#FF0000", "#00FF00"]\n'
                '- Comma-separated: #FF0000,#00FF00\n'
                f'Error: {exc}'
            ),
        )

    if not color_list or not isinstance(color_list, list):
        raise HTTPException(status_code=400, detail="Color list cannot be empty.")

    invalid = [c for c in color_list if not HEX_COLOR_RE.match(c)]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid hex color format: {invalid}. Expected format: #RRGGBB (e.g. #FF0000)",
        )

    return color_list


def _parse_percentages(percentages: str) -> list[float] | None:
    """Parse the optional percentages JSON array. Returns None on any failure."""
    if not percentages.strip():
        return None
    try:
        parsed = json.loads(percentages.strip())
        if isinstance(parsed, list):
            return parsed
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _validate_garment_upload(file: UploadFile) -> None:
    """Reject uploads that fail content-type or advertised size checks.

    The streaming cap inside save_upload_capped is the authoritative size
    check; this is the fast-reject pass for clients that send a truthful
    Content-Length.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Please upload an image (JPG, PNG).",
        )
    if file.size and file.size > MAX_FILE_SIZE:
        size_mb = file.size / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {size_mb:.2f}MB. Maximum allowed: 5MB.",
        )


@app.post("/api/garments/session")
async def create_garment_session(
    file: UploadFile = File(..., description="Garment image file (JPG, PNG)"),
):
    """Upload a garment, run rembg once, return a session_id plus mask.

    Subsequent calls to /api/garments/recolor reference this session_id
    instead of re-uploading and re-running background removal. The session
    is stored in memory with a sliding 30-minute TTL.

    The foreground mask is also returned as a base64-encoded PNG so the
    frontend can clip paint strokes to the garment outline. The mask is
    a 1-channel image where 255 = foreground, 0 = background.
    """
    import base64

    _validate_garment_upload(file)

    temp_path = await save_upload_capped(file, MAX_FILE_SIZE, ".jpg")
    try:
        validate_image_dimensions(temp_path)
        await run_in_thread_with_timeout(downscale_image, temp_path)

        recolorer = GarmentRecolorer(garment_image_path=temp_path)
        prepared = await run_in_thread_with_timeout(recolorer.prepare)
        if not prepared:
            raise HTTPException(
                status_code=400,
                detail="Could not prepare garment. The image may be corrupted or background removal failed.",
            )

        session = session_store.create(image=recolorer.image, mask=recolorer.mask)

        # Encode the rembg mask as a base64 PNG for the frontend's paint-mode
        # clipping. Mask is 2D uint8; cv2.imencode gives us a single-channel
        # PNG that the browser decodes into the same byte values via the
        # red channel.
        success, buffer = cv2.imencode(".png", session.mask)
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Could not encode foreground mask.",
            )
        mask_b64 = base64.b64encode(buffer.tobytes()).decode("ascii")

        logger.info(
            "garment session created",
            extra={
                "session_id": session.session_id,
                "width": session.width,
                "height": session.height,
            },
        )
        return {
            "session_id": session.session_id,
            "width": session.width,
            "height": session.height,
            "mask_png_b64": mask_b64,
        }
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


@app.post("/api/garments/recolor")
async def recolor_garment(
    session_id: str = Form(..., description="Session id returned from /api/garments/session"),
    colors: str = Form(..., description='Hex colors as JSON array ["#FF0000"] or comma-separated #FF0000,#00FF00'),
    percentages: str = Form(default="", description='Color percentages as JSON array [0.30, 0.22, 0.21]'),
):
    """Recolour the garment associated with `session_id` using the given palette.

    Result is cached per (session, colours, percentages) so identical inputs
    return immediately without re-running the HSV remap. Cache lives inside
    the session and expires with it.
    """
    color_list = _parse_color_list(colors)
    weight_list = _parse_percentages(percentages)

    session = session_store.get(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found or expired. Re-upload the garment to /api/garments/session.",
        )

    cache_key = make_recolor_cache_key(color_list, weight_list)
    cached = session.recolor_cache.get(cache_key)
    if cached is not None:
        logger.debug("recolor cache hit", extra={"session_id": session_id, "key": cache_key})
        return Response(content=cached, media_type="image/png")

    recolorer = GarmentRecolorer.from_prepared(image=session.image, mask=session.mask)
    applied = await run_in_thread_with_timeout(
        recolorer.apply_colors, color_list, weights=weight_list
    )
    if not applied:
        raise HTTPException(
            status_code=500,
            detail="Could not apply colours to the garment.",
        )

    success, buffer = cv2.imencode(".png", recolorer.recolored_image)
    if not success:
        raise HTTPException(status_code=500, detail="Could not encode recoloured image.")

    png_bytes = buffer.tobytes()
    session.recolor_cache[cache_key] = png_bytes
    logger.info(
        "recolor computed and cached",
        extra={"session_id": session_id, "key": cache_key, "bytes": len(png_bytes)},
    )
    return Response(content=png_bytes, media_type="image/png")

# ============================================================================
# ERROR HANDLERS (Optional but professional)
# ============================================================================

@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Custom 404 handler.

    Two distinct cases land here:
      1. Route not found (Starlette raises HTTPException with detail="Not Found"
         and the request did not match any registered path).
      2. A handler raised HTTPException(404) on purpose, e.g. session expired.

    Case 2 should preserve its own detail. Case 1 returns the friendlier
    "endpoint not found" body that points at /docs.
    """
    detail = getattr(exc, "detail", None)
    if detail and detail != "Not Found":
        return JSONResponse(status_code=404, content={"detail": detail})
    return JSONResponse(
        status_code=404,
        content={
            "error": "Endpoint not found",
            "message": "The requested endpoint does not exist. Check /docs for available endpoints.",
        },
    )