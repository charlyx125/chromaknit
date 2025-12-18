# ChromaKnit API Documentation

## API Overview

ChromaKnit provides a REST API for extracting dominant colors from yarn images and recoloring garment images with those colors. The API is built with FastAPI and designed for easy integration with frontend applications.

- **Base URL:** `http://localhost:8000` (development)
- **Authentication:** None (currently open access)
- **API Version:** 2.0.0
- **Interactive Docs:** `http://localhost:8000/docs`

---

## Endpoints

### 1. Extract Colors from Yarn

Extract dominant colors from a yarn image using K-means clustering.

**Endpoint:** `POST /api/colors/extract`

**Description:** Analyzes a yarn image and returns the dominant colors as hex codes, sorted by frequency.

#### Request Parameters

| Parameter  | Type    | Required | Description                                           |
| ---------- | ------- | -------- | ----------------------------------------------------- |
| `file`     | File    | ✅ Yes   | Yarn image file (JPG, PNG)                            |
| `n_colors` | integer | ❌ No    | Number of colors to extract (default: 5, range: 1-10) |

#### Request Format

```http
POST /api/colors/extract HTTP/1.1
Host: localhost:8000
Content-Type: multipart/form-data

file=@yarn.jpg
n_colors=5
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "colors": ["#142a68", "#23438d", "#0c153b", "#3e64b2", "#658ad6"],
  "count": 5,
  "filename": "yarn.jpg"
}
```

#### Error Responses

**400 Bad Request - Invalid file type:**

```json
{
  "detail": "Invalid file type: application/pdf. Please upload an image (JPG, PNG)."
}
```

**413 Payload Too Large:**

```json
{
  "detail": "File too large: 12.50MB. Maximum allowed: 5MB."
}
```

**400 Bad Request - Corrupted image:**

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
```

**JavaScript (fetch):**

```javascript
async function extractColors(fileInput, nColors = 5) {
  const formData = new FormData();
  formData.append("file", fileInput.files[0]);
  formData.append("n_colors", nColors);

  try {
    const response = await fetch("http://localhost:8000/api/colors/extract", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    const result = await response.json();
    console.log("Extracted colors:", result.colors);
    return result;
  } catch (error) {
    console.error("Color extraction failed:", error);
    throw error;
  }
}

// Usage
const fileInput = document.querySelector("#yarn-upload");
const result = await extractColors(fileInput, 5);
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

        return response.json()

# Usage
result = extract_colors('yarn.jpg', n_colors=5)
colors = result['colors']
print(f"Extracted {len(colors)} colors: {colors}")
```

---

### 2. Recolor Garment

Apply yarn colors to a garment image while preserving texture, shadows, and lighting.

**Endpoint:** `POST /api/garments/recolor`

**Description:** Recolors a garment image using provided colors. Automatically removes the background, then applies colors using HSV color space transformation to maintain realistic texture and lighting effects.

#### Request Parameters

| Parameter | Type   | Required | Description                                                                              |
| --------- | ------ | -------- | ---------------------------------------------------------------------------------------- |
| `file`    | File   | ✅ Yes   | Garment image file (JPG, PNG)                                                            |
| `colors`  | string | ✅ Yes   | Target colors - JSON array `["#142a68", "#23438d"]` or comma-separated `#142a68,#23438d` |

#### Request Format

```http
POST /api/garments/recolor HTTP/1.1
Host: localhost:8000
Content-Type: multipart/form-data

file=@sweater.jpg
colors=["#142a68","#23438d","#0c153b"]
```

#### Success Response (200 OK)

Returns a **PNG image file** (not JSON). The response has:

- Content-Type: `image/png`
- Content-Disposition: `attachment; filename="recolored_sweater.jpg"`

You'll receive the actual image bytes that can be saved or displayed directly.

#### Error Responses

**400 Bad Request - Invalid JSON:**

```json
{
  "detail": "Invalid JSON format for colors. Expected array like [\"#FF0000\", \"#00FF00\"]"
}
```

**400 Bad Request - Empty colors:**

```json
{
  "detail": "Color list cannot be empty."
}
```

**400 Bad Request - Invalid hex format:**

```json
{
  "detail": "Invalid hex color format: ['FF0000', '00FF00']. Expected format: #RRGGBB (e.g. #FF0000)"
}
```

**413 Payload Too Large:**

```json
{
  "detail": "File too large: 12.50MB. Maximum allowed: 5MB."
}
```

**400 Bad Request - Processing failed:**

```json
{
  "detail": "Could not recolor garment. The image may be corrupted or invalid."
}
```

#### Code Examples

**cURL:**

```bash
# Recolor with JSON array
curl -X POST http://localhost:8000/api/garments/recolor \
  -F "file=@sweater.jpg" \
  -F 'colors=["#142a68","#23438d","#0c153b"]' \
  --output recolored.png

# Recolor with comma-separated colors
curl -X POST http://localhost:8000/api/garments/recolor \
  -F "file=@sweater.jpg" \
  -F "colors=#142a68,#23438d,#0c153b" \
  --output recolored.png
```

**JavaScript (fetch):**

```javascript
async function recolorGarment(garmentFile, colors) {
  const formData = new FormData();
  formData.append("file", garmentFile);
  // Colors can be an array or comma-separated string
  formData.append("colors", JSON.stringify(colors));

  try {
    const response = await fetch("http://localhost:8000/api/garments/recolor", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    // Response is an image file, create blob URL
    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);

    // Display the recolored image
    const img = document.createElement("img");
    img.src = imageUrl;
    document.body.appendChild(img);

    return imageUrl;
  } catch (error) {
    console.error("Recoloring failed:", error);
    throw error;
  }
}

// Usage
const garmentFile = document.querySelector("#garment-upload").files[0];
const colors = ["#142a68", "#23438d", "#0c153b"];
await recolorGarment(garmentFile, colors);
```

**Python (requests):**

```python
import requests

def recolor_garment(garment_path, colors, output_path='recolored.png'):
    """Recolor a garment with specified colors."""
    url = "http://localhost:8000/api/garments/recolor"

    with open(garment_path, 'rb') as f:
        files = {'file': (garment_path, f, 'image/jpeg')}
        # Colors can be JSON array or comma-separated
        data = {'colors': ','.join(colors)}

        response = requests.post(url, files=files, data=data)
        response.raise_for_status()

        # Save the recolored image
        with open(output_path, 'wb') as out:
            out.write(response.content)

        print(f"Saved recolored image to {output_path}")
        return output_path

# Usage
colors = ['#142a68', '#23438d', '#0c153b']
output = recolor_garment('sweater.jpg', colors, 'recolored_sweater.png')
```

---

## Common Patterns

### Flexible Color Input Formats

The `/api/garments/recolor` endpoint accepts colors in two formats:

**1. JSON Array (recommended):**

```javascript
formData.append("colors", JSON.stringify(["#142a68", "#23438d"]));
```

**2. Comma-separated string:**

```javascript
formData.append("colors", "#142a68,#23438d,#0c153b");
```

Both formats are equivalent. JSON array is recommended for consistency with the extract endpoint response.

### Complete Workflow Example

```javascript
async function fullWorkflow(yarnFile, garmentFile) {
  try {
    // Step 1: Extract colors from yarn
    console.log("Extracting colors...");
    const formData1 = new FormData();
    formData1.append("file", yarnFile);
    formData1.append("n_colors", 5);

    const extractResponse = await fetch(
      "http://localhost:8000/api/colors/extract",
      { method: "POST", body: formData1 }
    );
    const { colors } = await extractResponse.json();

    // Step 2: Display color palette to user
    displayColorPalette(colors);

    // Step 3: Recolor garment with extracted colors
    console.log("Recoloring garment...");
    const formData2 = new FormData();
    formData2.append("file", garmentFile);
    formData2.append("colors", JSON.stringify(colors));

    const recolorResponse = await fetch(
      "http://localhost:8000/api/garments/recolor",
      { method: "POST", body: formData2 }
    );

    // Step 4: Display recolored image
    const blob = await recolorResponse.blob();
    const imageUrl = URL.createObjectURL(blob);
    document.querySelector("#result").src = imageUrl;
  } catch (error) {
    console.error("Workflow failed:", error);
    alert("Something went wrong. Please try again.");
  }
}
```

---

## Rate Limits & Constraints

### File Constraints

| Constraint        | Limit         | Reason                               |
| ----------------- | ------------- | ------------------------------------ |
| Maximum file size | 5MB           | Memory and processing efficiency     |
| Supported formats | JPEG, PNG     | Reliable cross-browser support       |
| Image dimensions  | No hard limit | Larger images take longer to process |

### Processing Time Expectations

Processing times vary based on image size:

| Operation          | Small (300x300) | Medium (800x800) | Large (1920x1080) |
| ------------------ | --------------- | ---------------- | ----------------- |
| Color extraction   | ~200ms          | ~1.5s            | ~4s               |
| Background removal | ~3s             | ~7s              | ~10s              |
| Full recoloring    | ~4s             | ~9s              | ~14s              |

_Note: Times measured on standard hardware. First request may be slower due to model loading._

---

## Best Practices

### 1. Validate Files Before Upload

```javascript
function validateFile(file) {
  const validTypes = ["image/jpeg", "image/png"];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid file type. Please upload JPEG or PNG");
  }

  if (file.size > maxSize) {
    throw new Error("File too large. Maximum size is 5MB");
  }

  return true;
}
```

### 2. Show Loading States

```javascript
// Disable button and show spinner
button.disabled = true;
spinner.style.display = "block";

await callAPI(endpoint, formData);

button.disabled = false;
spinner.style.display = "none";
```

### 3. Handle Errors Gracefully

```javascript
async function callAPI(endpoint, formData) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Unknown error");
    }

    return response;
  } catch (error) {
    console.error("API call failed:", error);
    alert(`Error: ${error.message}`);
    throw error;
  }
}
```

---

## Interactive Testing

### Swagger UI (Recommended)

FastAPI provides automatic interactive API documentation:

**URL:** http://localhost:8000/docs

**Features:**

- Browse all endpoints with descriptions
- Test requests directly in the browser
- Upload files and set parameters
- View request/response formats
- Download OpenAPI specification

**How to Use:**

1. Navigate to http://localhost:8000/docs
2. Click on an endpoint to expand
3. Click "Try it out"
4. Upload file and set parameters
5. Click "Execute" to send request
6. View response in the browser

### ReDoc (Alternative)

Clean, three-panel documentation:

**URL:** http://localhost:8000/redoc

---

## Quick Reference

**Base URL:** `http://localhost:8000`

**Endpoints:**

- `POST /api/colors/extract` - Extract colors from yarn
- `POST /api/garments/recolor` - Recolor garment with colors

**Common Status Codes:**

- `200` - Success
- `400` - Bad request (invalid input)
- `413` - Payload too large
- `500` - Server error

**File Requirements:**

- Formats: JPEG, PNG
- Max Size: 5MB
- Content-Type: multipart/form-data

**Color Formats:**

- Hex codes: `#142a68` (6 characters, case-insensitive)
- Array: `["#142a68", "#23438d"]`
- String: `#142a68,#23438d`

---

## Support & Feedback

- **Repository:** https://github.com/charlyx125/chromaknit
- **Issues:** https://github.com/charlyx125/chromaknit/issues
- **Author:** Joyce Chong (@charlyx125)

**Last Updated:** December 2024  
**API Version:** 2.0.0  
**Status:** Phase 2 Complete - Backend Development
