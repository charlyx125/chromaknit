# ChromaKnit API Documentation

## API Overview

ChromaKnit provides a REST API for extracting dominant colors from yarn images and recoloring garment images with those colors. The API is built with FastAPI and designed for easy integration with frontend applications.

**Base URL:** `http://localhost:8000` (development)  
**Authentication:** None (currently open access)  
**API Version:** 2.0.0  
**Content Types:** `multipart/form-data` for file uploads

---

## Quick Start

```bash
# 1. Start the API server
uvicorn api.main:app --reload

# 2. Open interactive docs
# Browser: http://localhost:8000/docs

# 3. Extract colors from yarn
curl -X POST http://localhost:8000/api/colors/extract \
  -F "file=@yarn.jpg" \
  -F "n_colors=5"

# 4. Recolor garment
curl -X POST http://localhost:8000/api/garments/recolor \
  -F "file=@sweater.jpg" \
  -F 'colors=["#142a68","#23438d","#0c153b"]' \
  --output recolored.png
```

---

## Endpoints

### 1. Root Endpoint

Get API information and available endpoints.

**Endpoint:** `GET /`

**Response:**
```json
{
  "message": "Welcome to ChromaKnit API!",
  "version": "2.0.0",
  "endpoints": {
    "docs": "/docs",
    "health": "/health",
    "color_extraction": "/api/colors/extract",
    "garment_recoloring": "/api/garments/recolor"
  }
}
```

### 2. Health Check

Check API health status for monitoring.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "version": "2.0.0"
}
```

---

### 3. Extract Colors from Yarn

Extract dominant colors from a yarn image using K-means clustering.

**Endpoint:** `POST /api/colors/extract`

**Description:** Analyzes a yarn image and returns the dominant colors as hex codes, sorted by frequency. The API validates file type and size before processing.

#### Request Parameters

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `file` | File | ✅ Yes | Yarn image file | JPG, PNG; max 5MB |
| `n_colors` | integer | ❌ No | Number of colors to extract | 1-10 (default: 5) |

#### Request Format

```http
POST /api/colors/extract HTTP/1.1
Host: localhost:8000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="yarn.jpg"
Content-Type: image/jpeg

[binary image data]
------WebKitFormBoundary
Content-Disposition: form-data; name="n_colors"

5
------WebKitFormBoundary--
```

#### Response Format

**Success Response (200 OK):**

```json
{
  "success": true,
  "colors": ["#142a68", "#23438d", "#0c153b", "#3e64b2", "#658ad6"],
  "count": 5,
  "filename": "yarn.jpg"
}
```

**Response Fields:**
- `success` (boolean): Indicates successful extraction
- `colors` (array): Hex color codes sorted by frequency (most common first)
- `count` (integer): Number of colors extracted
- `filename` (string): Original uploaded filename

#### Error Responses

**400 Bad Request - Invalid file type:**
```json
{
  "detail": "Invalid file type: text/plain. Please upload an image (JPG, PNG)."
}
```

**413 Payload Too Large - File too large:**
```json
{
  "detail": "File too large: 7.23MB. Maximum allowed: 5MB."
}
```

**400 Bad Request - Extraction failed:**
```json
{
  "detail": "Could not extract colors from image. The file may be corrupted or invalid."
}
```

#### Code Examples

**cURL:**
```bash
# Basic extraction with default 5 colors
curl -X POST http://localhost:8000/api/colors/extract \
  -F "file=@yarn.jpg"

# Extract 8 colors
curl -X POST http://localhost:8000/api/colors/extract \
  -F "file=@yarn.jpg" \
  -F "n_colors=8"

# Save response to file
curl -X POST http://localhost:8000/api/colors/extract \
  -F "file=@yarn.jpg" \
  -F "n_colors=5" \
  -o colors.json
```

**JavaScript (fetch):**
```javascript
async function extractColors(fileInput, nColors = 5) {
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('n_colors', nColors);

  try {
    const response = await fetch('http://localhost:8000/api/colors/extract', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    const result = await response.json();
    // result.colors is an array like: ["#142a68", "#23438d", "#0c153b"]
    console.log(`Extracted ${result.count} colors:`, result.colors);
    
    return result.colors;
  } catch (error) {
    console.error('Color extraction failed:', error.message);
    throw error;
  }
}

// Usage with file input
const fileInput = document.querySelector('#yarn-upload');
const colors = await extractColors(fileInput, 5);

// Display color swatches
colors.forEach(hex => {
  const swatch = document.createElement('div');
  swatch.style.backgroundColor = hex;
  swatch.style.width = '50px';
  swatch.style.height = '50px';
  swatch.title = hex;
  document.body.appendChild(swatch);
});
```

**Python (requests):**
```python
import requests

def extract_colors(image_path, n_colors=5):
    """Extract dominant colors from a yarn image."""
    url = "http://localhost:8000/api/colors/extract"
    
    with open(image_path, 'rb') as f:
        files = {'file': ('yarn.jpg', f, 'image/jpeg')}
        data = {'n_colors': n_colors}
        
        response = requests.post(url, files=files, data=data)
        response.raise_for_status()
        
        result = response.json()
        return result['colors']

# Usage
colors = extract_colors('examples/sample-yarn.jpg', n_colors=5)
print(f"Extracted colors: {colors}")
# Output: ['#142a68', '#23438d', '#0c153b', '#3e64b2', '#658ad6']
```

---

### 4. Recolor Garment

Apply yarn colors to a garment image while preserving texture, shadows, and lighting.

**Endpoint:** `POST /api/garments/recolor`

**Description:** Recolors a garment image using provided colors. Automatically removes the background, then applies colors using HSV color space transformation to maintain realistic texture and lighting effects. **Returns the recolored image directly as a PNG file**.

#### Request Parameters

| Parameter | Type | Required | Description | Format |
|-----------|------|----------|-------------|--------|
| `file` | File | ✅ Yes | Garment image file | JPG, PNG; max 5MB |
| `colors` | string | ✅ Yes | Target colors | JSON array or comma-separated |

#### Color Format Options

The `colors` parameter accepts **two formats**:

**1. JSON Array (recommended):**
```json
["#142a68", "#23438d", "#0c153b"]
```

**2. Comma-separated string:**
```
#142a68,#23438d,#0c153b
```

Both formats are equivalent. JSON array is easier to work with in JavaScript.

#### Request Format

```http
POST /api/garments/recolor HTTP/1.1
Host: localhost:8000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="sweater.jpg"
Content-Type: image/jpeg

[binary image data]
------WebKitFormBoundary
Content-Disposition: form-data; name="colors"

["#142a68","#23438d","#0c153b"]
------WebKitFormBoundary--
```

#### Response Format

**Success Response (200 OK):**

```
Content-Type: image/png
Content-Disposition: attachment; filename="recolored_sweater.jpg"

[binary PNG image data]
```

The response is **the actual PNG image file**, not JSON. You can:
- Display it directly in an `<img>` tag using a blob URL
- Download it as a file
- Save it to disk

#### Error Responses

**400 Bad Request - Invalid color format:**
```json
{
  "detail": "Invalid color format. Use either:\n- JSON array: [\"#FF0000\", \"#00FF00\"]\n- Comma-separated: #FF0000,#00FF00\nError: ..."
}
```

**400 Bad Request - Empty color list:**
```json
{
  "detail": "Color list cannot be empty."
}
```

**400 Bad Request - Invalid hex codes:**
```json
{
  "detail": "Invalid hex color format: ['#zzz', '#123']. Expected format: #RRGGBB (e.g. #FF0000)"
}
```

**400 Bad Request - Invalid file type:**
```json
{
  "detail": "Invalid file type: application/pdf. Please upload an image (JPG, PNG)."
}
```

**413 Payload Too Large:**
```json
{
  "detail": "File too large: 8.45MB. Maximum allowed: 5MB."
}
```

**400 Bad Request - Recoloring failed:**
```json
{
  "detail": "Could not recolor garment. The image may be corrupted or invalid."
}
```

#### Code Examples

**cURL:**
```bash
# Recolor with JSON array and save result
curl -X POST http://localhost:8000/api/garments/recolor \
  -F "file=@sweater.jpg" \
  -F 'colors=["#142a68","#23438d","#0c153b"]' \
  --output recolored_sweater.png

# Recolor with comma-separated colors
curl -X POST http://localhost:8000/api/garments/recolor \
  -F "file=@sweater.jpg" \
  -F "colors=#142a68,#23438d,#0c153b" \
  -o result.png

# Using colors from previous extraction
COLORS='["#142a68","#23438d","#0c153b"]'
curl -X POST http://localhost:8000/api/garments/recolor \
  -F "file=@garment.jpg" \
  -F "colors=$COLORS" \
  -o recolored.png
```

**JavaScript (fetch) - Display in Browser:**
```javascript
async function recolorGarment(garmentFile, colors) {
  const formData = new FormData();
  formData.append('file', garmentFile);
  formData.append('colors', JSON.stringify(colors)); // Convert array to JSON string

  try {
    const response = await fetch('http://localhost:8000/api/garments/recolor', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    // Response is a PNG image blob
    const imageBlob = await response.blob();
    
    // Create blob URL for display
    const imageUrl = URL.createObjectURL(imageBlob);
    
    // Display in img element
    const img = document.querySelector('#result-image');
    img.src = imageUrl;
    
    // Optional: Trigger download
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'recolored_garment.png';
    link.click();
    
    return imageUrl;
  } catch (error) {
    console.error('Recoloring failed:', error.message);
    throw error;
  }
}

// Usage
const garmentFile = document.querySelector('#garment-upload').files[0];
const colors = ['#142a68', '#23438d', '#0c153b'];
await recolorGarment(garmentFile, colors);
```

**JavaScript (fetch) - Download File:**
```javascript
async function downloadRecoloredGarment(garmentFile, colors) {
  const formData = new FormData();
  formData.append('file', garmentFile);
  formData.append('colors', JSON.stringify(colors));

  const response = await fetch('http://localhost:8000/api/garments/recolor', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail);
  }

  // Get the blob
  const blob = await response.blob();
  
  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'recolored_garment.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

**Python (requests):**
```python
import requests

def recolor_garment(garment_path, colors, output_path='recolored.png'):
    """Recolor a garment with specified colors."""
    url = "http://localhost:8000/api/garments/recolor"
    
    with open(garment_path, 'rb') as f:
        files = {'file': (garment_path, f, 'image/jpeg')}
        # Can use either format:
        # JSON: data = {'colors': json.dumps(colors)}
        # CSV: data = {'colors': ','.join(colors)}
        data = {'colors': ','.join(colors)}
        
        response = requests.post(url, files=files, data=data)
        response.raise_for_status()
        
        # Save the PNG image
        with open(output_path, 'wb') as out:
            out.write(response.content)
        
        print(f"✅ Saved recolored image to {output_path}")
        return output_path

# Usage
colors = ['#142a68', '#23438d', '#0c153b']
recolor_garment('examples/sample-garment.jpg', colors, 'results/recolored.png')
```

---

## Common Patterns

### Complete Workflow: Extract → Recolor

The typical workflow extracts colors from yarn, then applies them to a garment:

```javascript
async function completeWorkflow(yarnFile, garmentFile) {
  try {
    // Step 1: Extract colors from yarn
    console.log('Extracting colors from yarn...');
    const formData1 = new FormData();
    formData1.append('file', yarnFile);
    formData1.append('n_colors', 5);
    
    const extractResponse = await fetch(
      'http://localhost:8000/api/colors/extract',
      { method: 'POST', body: formData1 }
    );
    
    if (!extractResponse.ok) {
      throw new Error('Color extraction failed');
    }
    
    const { colors } = await extractResponse.json();
    console.log('Extracted colors:', colors);
    
    // Step 2: Show color palette to user (optional)
    displayColorPalette(colors);
    
    // Step 3: Recolor garment
    console.log('Recoloring garment...');
    const formData2 = new FormData();
    formData2.append('file', garmentFile);
    formData2.append('colors', JSON.stringify(colors));
    
    const recolorResponse = await fetch(
      'http://localhost:8000/api/garments/recolor',
      { method: 'POST', body: formData2 }
    );
    
    if (!recolorResponse.ok) {
      throw new Error('Garment recoloring failed');
    }
    
    // Step 4: Display result
    const imageBlob = await recolorResponse.blob();
    const imageUrl = URL.createObjectURL(imageBlob);
    document.querySelector('#result-image').src = imageUrl;
    
    console.log('✅ Workflow complete!');
    
  } catch (error) {
    console.error('Workflow failed:', error);
    alert(`Error: ${error.message}`);
  }
}

// Helper function to display color palette
function displayColorPalette(colors) {
  const palette = document.querySelector('#color-palette');
  palette.innerHTML = ''; // Clear existing
  
  colors.forEach(hex => {
    const swatch = document.createElement('div');
    swatch.style.backgroundColor = hex;
    swatch.style.width = '60px';
    swatch.style.height = '60px';
    swatch.style.display = 'inline-block';
    swatch.style.margin = '5px';
    swatch.style.border = '2px solid #ccc';
    swatch.title = hex;
    palette.appendChild(swatch);
  });
}
```

### File Upload Validation

Always validate files before uploading:

```javascript
function validateFile(file) {
  // Check file type
  const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please upload JPG or PNG.');
  }

  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`File too large (${sizeMB}MB). Maximum size is 5MB.`);
  }

  return true;
}

// Usage in file input handler
document.querySelector('#file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  try {
    validateFile(file);
    console.log('✅ File is valid');
  } catch (error) {
    alert(error.message);
    e.target.value = ''; // Clear input
  }
});
```

### Error Handling Best Practices

Robust error handling for all API calls:

```javascript
async function apiCallWithErrorHandling(endpoint, formData) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    // Handle different status codes
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      
      // API returns JSON errors
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        
        // Handle specific error cases
        if (response.status === 413) {
          alert('File is too large. Please upload an image under 5MB.');
        } else if (response.status === 400) {
          alert(`Invalid request: ${error.detail}`);
        } else {
          alert(`Error: ${error.detail}`);
        }
        
        throw new Error(error.detail);
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}
```

### Loading States & User Feedback

Show progress during processing:

```javascript
async function recolorWithProgress(garmentFile, colors) {
  const button = document.querySelector('#recolor-btn');
  const spinner = document.querySelector('#loading-spinner');
  const status = document.querySelector('#status-text');
  
  try {
    // Disable UI during processing
    button.disabled = true;
    spinner.style.display = 'block';
    status.textContent = 'Recoloring garment... (this may take 5-10 seconds)';
    
    const formData = new FormData();
    formData.append('file', garmentFile);
    formData.append('colors', JSON.stringify(colors));
    
    const response = await fetch('http://localhost:8000/api/garments/recolor', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }
    
    const imageBlob = await response.blob();
    const imageUrl = URL.createObjectURL(imageBlob);
    
    document.querySelector('#result-image').src = imageUrl;
    status.textContent = '✅ Recoloring complete!';
    
  } catch (error) {
    status.textContent = `❌ Error: ${error.message}`;
    console.error('Recoloring failed:', error);
  } finally {
    // Re-enable UI
    button.disabled = false;
    spinner.style.display = 'none';
  }
}
```

---

## Rate Limits & Constraints

### File Constraints

| Constraint | Limit | Applies To |
|------------|-------|------------|
| Maximum file size | 5MB | Both endpoints |
| Supported formats | JPG, PNG | Both endpoints |
| Minimum image size | None | Both endpoints |
| Maximum image size | None (limited by 5MB) | Both endpoints |

### Processing Time Expectations

Processing times vary by image size and operation:

| Operation | Small (300x300) | Medium (800x800) | Large (1920x1080) |
|-----------|----------------|------------------|-------------------|
| Color extraction | ~200ms | ~1.5s | ~4s |
| Background removal | ~3s | ~7s | ~10s |
| Full recoloring | ~4s | ~9s | ~14s |

**Notes:**
- Times measured on standard development hardware
- First request may be slower due to model loading (rembg)
- Recoloring includes background removal time

### Parameter Constraints

| Parameter | Minimum | Maximum | Default | Validation |
|-----------|---------|---------|---------|------------|
| `n_colors` | 1 | 10 | 5 | Integer only |
| `colors` array | 1 color | None | Required | Valid hex codes |
| Hex codes | - | - | - | Must match `#RRGGBB` format |

### Rate Limits

**Current:** No rate limits enforced

**Production Recommendations:**
- Implement rate limiting: 20 requests/minute per IP
- Consider request queuing for large images
- Add webhooks for async processing
- Monitor server resources (memory spikes during background removal)

---

## Integration Guide

### Setting Up Your Frontend

**1. Install dependencies:**
```bash
# No special dependencies needed for basic fetch API
# For React, you might want:
npm install axios  # Optional, for easier file uploads
```

**2. Configure API base URL:**
```javascript
// config.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
  extractColors: `${API_BASE_URL}/api/colors/extract`,
  recolorGarment: `${API_BASE_URL}/api/garments/recolor`,
  health: `${API_BASE_URL}/health`
};
```

**3. Create API service module:**
```javascript
// services/chromaknit-api.js
import { API_ENDPOINTS } from '../config';

export class ChromaKnitAPI {
  static async extractColors(file, nColors = 5) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('n_colors', nColors);

    const response = await fetch(API_ENDPOINTS.extractColors, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    return response.json();
  }

  static async recolorGarment(file, colors) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('colors', JSON.stringify(colors));

    const response = await fetch(API_ENDPOINTS.recolorGarment, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    return response.blob();
  }

  static async checkHealth() {
    const response = await fetch(API_ENDPOINTS.health);
    return response.json();
  }
}
```

### CORS Configuration (Phase 3)

When deploying frontend and backend separately, configure CORS:

**Backend (api/main.py):**
```python
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(...)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React dev server
        "https://yourdomain.com"   # Production frontend
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

**Frontend:** No changes needed if CORS is properly configured on backend.

### Testing Connection

```javascript
// Test API connectivity
async function testAPIConnection() {
  try {
    const response = await fetch('http://localhost:8000/health');
    const data = await response.json();
    
    if (data.status === 'healthy') {
      console.log('✅ API is healthy:', data.version);
      return true;
    }
  } catch (error) {
    console.error('❌ Cannot connect to API:', error);
    return false;
  }
}

// Call on app initialization
testAPIConnection();
```

---

## Interactive Testing

### Swagger UI (Recommended)

FastAPI provides automatic interactive documentation:

**URL:** `http://localhost:8000/docs`

**Features:**
- Try all endpoints directly in browser
- Upload files and test with real data
- View request/response schemas
- See validation errors in real-time
- Download OpenAPI specification

**How to Use:**
1. Start API: `uvicorn api.main:app --reload`
2. Open browser: `http://localhost:8000/docs`
3. Click endpoint to expand (e.g., `/api/colors/extract`)
4. Click "Try it out" button
5. Upload file and set parameters
6. Click "Execute"
7. View response body and status code

**Tips:**
- Use sample images from `examples/` folder
- Test error cases (wrong file type, too large, etc.)
- Copy curl commands for automation

### ReDoc (Alternative)

Clean, three-panel API documentation:

**URL:** `http://localhost:8000/redoc`

Better for reading documentation, but no interactive testing.

### Manual Testing with cURL

```bash
# Test health endpoint
curl http://localhost:8000/health

# Extract colors
curl -X POST http://localhost:8000/api/colors/extract \
  -F "file=@examples/sample-yarn.jpg" \
  -F "n_colors=5"

# Recolor garment
curl -X POST http://localhost:8000/api/garments/recolor \
  -F "file=@examples/sample-garment.jpg" \
  -F 'colors=["#142a68","#23438d"]' \
  --output results/test-recolored.png

# Check if image was created
file results/test-recolored.png
# Should output: PNG image data, ...
```

---

## Troubleshooting

### Common Issues

**1. "Could not extract colors from image"**
- **Cause:** Invalid or corrupted image file
- **Solution:** Verify image can be opened in image viewer, try different image

**2. "File too large" (413 error)**
- **Cause:** File exceeds 5MB limit
- **Solution:** Compress image before upload or resize to smaller dimensions

**3. "Invalid file type"**
- **Cause:** Uploaded non-image file or unsupported format
- **Solution:** Ensure file is JPG or PNG

**4. "Invalid hex color format"**
- **Cause:** Malformed hex code (e.g., missing `#`, wrong length)
- **Solution:** Ensure format is `#RRGGBB` (e.g., `#FF0000`)

**5. CORS errors in browser**
- **Cause:** Frontend on different origin than backend
- **Solution:** Add CORS middleware to FastAPI (see CORS Configuration section)

**6. Slow processing times**
- **Cause:** Large images or first request (model loading)
- **Solution:** 
  - Show loading indicator to user
  - Consider resizing images client-side before upload
  - First request loads rembg model (10s), subsequent requests are faster

### Debug Mode

Enable debug logging in FastAPI:

```bash
# Start with debug logging
uvicorn api.main:app --reload --log-level debug
```

Check console for:
- `✅ Parsed N colors: [...]` - Color parsing successful
- File validation messages
- Error tracebacks

---

## API Reference Summary

### Base URL
```
http://localhost:8000
```

### Endpoints Overview

| Method | Endpoint | Purpose | Returns |
|--------|----------|---------|---------|
| GET | `/` | API info | JSON |
| GET | `/health` | Health check | JSON |
| POST | `/api/colors/extract` | Extract colors from yarn | JSON with hex codes |
| POST | `/api/garments/recolor` | Recolor garment | PNG image file |

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | Success | Request processed successfully |
| 400 | Bad Request | Invalid input (wrong format, empty data) |
| 404 | Not Found | Invalid endpoint |
| 413 | Payload Too Large | File exceeds 5MB |
| 422 | Unprocessable Entity | Missing required field |
| 500 | Server Error | Internal processing error |

### Color Format Requirements

- **Format:** 6-character hex codes
- **Pattern:** `#RRGGBB` (case-insensitive)
- **Valid examples:** `#FF0000`, `#00ff00`, `#142A68`
- **Invalid examples:** `#FFF`, `FF0000`, `#GG0000`, `red`

### File Requirements

- **Formats:** JPEG (`.jpg`, `.jpeg`), PNG (`.png`)
- **Max size:** 5MB (5,242,880 bytes)
- **Min size:** No minimum
- **Validation:** Must have valid image MIME type

---

## Example Application

### Complete React Component

```javascript
import React, { useState } from 'react';
import { ChromaKnitAPI } from './services/chromaknit-api';

function ChromaKnitApp() {
  const [yarnFile, setYarnFile] = useState(null);
  const [garmentFile, setGarmentFile] = useState(null);
  const [extractedColors, setExtractedColors] = useState([]);
  const [recoloredImageUrl, setRecoloredImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleExtractColors = async () => {
    if (!yarnFile) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await ChromaKnitAPI.extractColors(yarnFile, 5);
      setExtractedColors(result.colors);
      alert(`Extracted ${result.count} colors!`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecolorGarment = async () => {
    if (!garmentFile || extractedColors.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const imageBlob = await ChromaKnitAPI.recolorGarment(
        garmentFile,
        extractedColors
      );
      const imageUrl = URL.createObjectURL(imageBlob);
      setRecoloredImageUrl(imageUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <h1>ChromaKnit - Yarn Color Extractor</h1>
      
      {error && <div className="error">{error}</div>}
      
      <div className="upload-section">
        <h2>Step 1: Upload Yarn</h2>
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => setYarnFile(e.target.files[0])}
        />
        <button onClick={handleExtractColors} disabled={!yarnFile || loading}>
          {loading ? 'Extracting...' : 'Extract Colors'}
        </button>
      </div>

      {extractedColors.length > 0 && (
        <div className="colors-section">
          <h2>Extracted Colors:</h2>
          <div className="color-palette">
            {extractedColors.map((hex, i) => (
              <div
                key={i}
                className="color-swatch"
                style={{ backgroundColor: hex }}
                title={hex}
              >
                {hex}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="upload-section">
        <h2>Step 2: Upload Garment</h2>
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => setGarmentFile(e.target.files[0])}
        />
        <button
          onClick={handleRecolorGarment}
          disabled={!garmentFile || extractedColors.length === 0 || loading}
        >
          {loading ? 'Recoloring...' : 'Recolor Garment'}
        </button>
      </div>

      {recoloredImageUrl && (
        <div className="result-section">
          <h2>Result:</h2>
          <img src={recoloredImageUrl} alt="Recolored garment" />
        </div>
      )}
    </div>
  );
}

export default ChromaKnitApp;
```

---

## Support & Contribution

- **Repository:** [github.com/charlyx125/chromaknit](https://github.com/charlyx125/chromaknit)
- **Issues:** [github.com/charlyx125/chromaknit/issues](https://github.com/charlyx125/chromaknit/issues)
- **Documentation:** [github.com/charlyx125/chromaknit/tree/main/docs](https://github.com/charlyx125/chromaknit/tree/main/docs)
- **Author:** Joyce Chong (@charlyx125)

---

**Last Updated:** December 2024  
**API Version:** 2.0.0  
**Status:** Phase 2 - Backend API Complete