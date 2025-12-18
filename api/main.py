"""
GET:  Client ← Server
      "Give me data"
      
POST: Client → Server  
      "Here's data, process it"
      
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
import json
import tempfile
import os
from core.garment_recolor import GarmentRecolorer
from core.yarn_color_extractor import ColorExtractor



app = FastAPI(
    title="ChromaKnit API",
    description="Extract colors from yarn and recolor garments",
    version="2.0.0"
)

@app.get("/")
def read_root():
    return {"message": "Welcome to ChromaKnit API!"}


@app.get("/health")
def health_check():
    """Check API health status"""
    return {"status": "healthy", "version": "2.0"}



"""
**Layers of Defense:**

Request → [1. Type Check] → [2. Size Check] → [3. Processing Check] → Response
          ❌ PDF             ❌ 50MB file      ❌ Corrupted
          Fast fail          Fast fail         Caught after processing
"""
# Define max file size (5MB in bytes)
MAX_FILE_SIZE = 5 * 1024 * 1024 

@app.post("/api/colors/extract")
async def extract_colors(
    file: UploadFile = File(...),
    n_colors: int = 5
):
    """Extract dominant colors from uploaded yarn image"""
    
    # Validation 1: File type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Please upload an image (JPG, PNG)."
        )
    
    # Validation 2: File size (NEW!)
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
        extractor = ColorExtractor(image_path=temp_path, n_colors=n_colors)
        colors = extractor.extract_dominant_colors()
        
        # Validation 3: Empty colors
        if not colors:
            raise HTTPException(
                status_code=400,
                detail="Could not extract colors from image. The file may be corrupted."
            )
        
        return {
            "success": True,
            "colors": colors,
            "count": len(colors),
            "filename": file.filename
        }
    
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)



@app.post("/api/garments/recolor")
async def recolor_garment(
    garment_file: UploadFile = File(...),
    colors: str = Form(...)
):
    """
    Recolor garment with provided colors
    
    - **garment_file**: Garment image (JPG, PNG)
    - **colors**: JSON array of hex colors, e.g. ["#FF0000", "#00FF00"]
    """
    
    # TODO: Parse colors JSON
    
    # TODO: Validate file type
    
    # TODO: Validate file size
    
    # TODO: Save garment to temp file
    
    # TODO: Use GarmentRecolorer
    
    # TODO: Save recolored result
    
    # TODO: Return FileResponse
    