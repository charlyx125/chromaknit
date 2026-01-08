"""
ChromaKnit API - Color extraction and garment recoloring endpoints

REST API Patterns:
- GET:  Client ← Server ("Give me data")
- POST: Client → Server ("Here's data, process it")
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
import json
import tempfile
import os
from core.yarn_color_extractor import ColorExtractor
from core.garment_recolor import GarmentRecolorer
from fastapi.middleware.cors import CORSMiddleware 


# Initialize FastAPI application
app = FastAPI(
    title="ChromaKnit API",
    description="Extract colors from yarn and recolor garments",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Configuration
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB in bytes


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
    
    # Validation 2: File size
    if file.size and file.size > MAX_FILE_SIZE:
        size_mb = file.size / (1024 * 1024)
        raise HTTPException(
            status_code=413,  # Payload Too Large
            detail=f"File too large: {size_mb:.2f}MB. Maximum allowed: 5MB."
        )
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_file:
        contents = await file.read()
        temp_file.write(contents)
        temp_path = temp_file.name
    
    try:
        # Extract colors using ColorExtractor
        extractor = ColorExtractor(image_path=temp_path, n_colors=n_colors)
        colors = extractor.extract_dominant_colors()
        
        # Validation 3: Check if extraction succeeded
        if not colors:
            raise HTTPException(
                status_code=400,
                detail="Could not extract colors from image. The file may be corrupted or invalid."
            )
        
        return {
            "success": True,
            "colors": colors,
            "count": len(colors),
            "filename": file.filename
        }
    
    finally:
        # Clean up temporary file
        if os.path.exists(temp_path):
            os.unlink(temp_path)


# ============================================================================
# GARMENT RECOLORING ENDPOINT
# ============================================================================
@app.post("/api/garments/recolor")
async def recolor_garment(
    file: UploadFile = File(..., description="Garment image file (JPG, PNG)"),
    colors: str = Form(..., description='Hex colors as JSON array ["#FF0000"] or comma-separated #FF0000,#00FF00')
):
    """
    Recolor garment image with provided color palette while preserving texture and lighting.
    
    **Process:**
    1. Validates file type, size, and color format
    2. Removes background automatically
    3. Recolors garment in HSV color space
    4. Preserves shadows, highlights, and texture
    
    **Parameters:**
    - **file**: Garment image file (JPG, PNG format)
    - **colors**: Hex colors in either format:
        - JSON array: `["#142a68", "#23438d", "#0c153b"]`
        - Comma-separated: `#142a68,#23438d,#0c153b`
    
    **Returns:**
    - Recolored garment image (PNG format)
    
    **Usage Flow:**
    1. POST to /api/colors/extract with yarn image
    2. Copy the returned colors array
    3. POST to /api/garments/recolor with garment image + colors
    """
    
    # Parse colors - handle both JSON array and comma-separated string
    try:
        colors_trimmed = colors.strip()
        
        # Check if it's a JSON array
        if colors_trimmed.startswith('[') and colors_trimmed.endswith(']'):
            # Parse as JSON
            color_list = json.loads(colors_trimmed)
        else:
            # Parse as comma-separated string
            color_list = [c.strip() for c in colors_trimmed.split(',') if c.strip()]
        
        print(f"✅ Parsed {len(color_list)} colors: {color_list}")
        
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=400,
            detail=f'Invalid color format. Use either:\n- JSON array: ["#FF0000", "#00FF00"]\n- Comma-separated: #FF0000,#00FF00\nError: {str(e)}'
        )
    
    # Validation 1: Color list not empty
    if not color_list or not isinstance(color_list, list):
        raise HTTPException(
            status_code=400,
            detail="Color list cannot be empty."
        )
    
    # Validation 2: Check all colors are valid hex format
    import re
    hex_pattern = re.compile(r'^#[0-9A-Fa-f]{6}$')
    invalid_colors = [c for c in color_list if not hex_pattern.match(c)]
    if invalid_colors:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid hex color format: {invalid_colors}. Expected format: #RRGGBB (e.g. #FF0000)"
        )
    
    # Validation 3: File type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Please upload an image (JPG, PNG)."
        )
    
    # Validation 4: File size
    if file.size and file.size > MAX_FILE_SIZE:
        size_mb = file.size / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {size_mb:.2f}MB. Maximum allowed: 5MB."
        )
    
    # Save uploaded garment file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_file:
        contents = await file.read()
        temp_file.write(contents)
        temp_path = temp_file.name
    
    try:
        # Recolor the garment
        recolorer = GarmentRecolorer(garment_image_path=temp_path)
        recolored_image = recolorer.recolor_garment(color_list)
        
        # Check if recoloring succeeded
        if recolored_image is None or recolored_image.size == 0:
            raise HTTPException(
                status_code=400,
                detail="Could not recolor garment. The image may be corrupted or invalid."
            )
        
        # Save result to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as output_file:
            output_path = output_file.name
        
        recolorer.save_result(output_path)
        
        # Read the recolored image into memory
        with open(output_path, 'rb') as f:
            image_data = f.read()
        
        # Clean up output file (we have the data in memory)
        os.unlink(output_path)
        
        # Return the recolored image
        return Response(
            content=image_data,
            media_type="image/png",
            headers={
                "Content-Disposition": f'attachment; filename="recolored_{file.filename}"'
            }
        )
    
    finally:
        # Clean up input temporary file
        if os.path.exists(temp_path):
            os.unlink(temp_path)

# ============================================================================
# ERROR HANDLERS (Optional but professional)
# ============================================================================

@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Custom 404 handler"""
    return {
        "error": "Endpoint not found",
        "message": "The requested endpoint does not exist. Check /docs for available endpoints."
    }