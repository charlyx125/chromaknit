# Decision 003: API designs

**Date:** 2025-12-17
**Decision Makers:** Joyce Chong

---

## Overview

This document records the key architectural and design decisions made during the development of the ChromaKnit REST API. The API provides color extraction from yarn images and garment recoloring capabilities, built with FastAPI and designed for frontend integration.

---

## Decision 1: Framework Selection - FastAPI

### Context

ChromaKnit needed a Python web framework to expose color extraction and garment recoloring functionality via REST endpoints. The API would:

- Handle file uploads (images up to 5MB)
- Process compute-intensive operations (K-means clustering, background removal)
- Provide clear documentation for frontend developers
- Support rapid development and iteration

Three main frameworks were considered: Flask, Django REST Framework (DRF), and FastAPI.

### Decision

**Selected: FastAPI**

```python
from fastapi import FastAPI, UploadFile, File, Form, HTTPException

app = FastAPI(
    title="ChromaKnit API",
    description="Extract colors from yarn and recolor garments",
    version="2.0.0"
)
```

### Rationale

**Performance:**

- FastAPI is built on Starlette (ASGI), providing async support out of the box
- 2-3x faster than Flask for I/O-bound operations (file uploads, processing)
- Better handles concurrent requests during image processing

**Auto-Documentation:**

- Automatic OpenAPI schema generation
- Interactive Swagger UI at `/docs` - critical for frontend developers
- ReDoc alternative documentation at `/redoc`
- No need to manually write API documentation

**Type Safety:**

- Built on Pydantic for data validation
- Type hints enable better IDE support and catch errors early
- Request/response validation happens automatically

**Developer Experience:**

- Clean, modern syntax with Python 3.7+ features
- Dependency injection system simplifies testing
- Excellent error messages and validation feedback

### Alternatives Considered

**Flask:**

- ❌ No built-in async support (requires Flask-Async)
- ❌ No automatic documentation (would need Flask-RESTX or manual Swagger)
- ❌ Manual validation required
- ✅ Lighter weight, more established ecosystem
- ✅ Simpler for small projects

**Django REST Framework:**

- ❌ Heavyweight - full ORM, admin panel not needed
- ❌ Slower startup and runtime performance
- ❌ Steeper learning curve
- ✅ Excellent for database-heavy applications
- ✅ Built-in authentication/authorization

### Consequences

**Positive:**

- Frontend developers can test endpoints immediately via `/docs`
- Type validation catches errors before processing
- Async support ready for future background task processing
- Fast enough to handle multiple concurrent requests
- Minimal boilerplate code

**Negative:**

- Smaller ecosystem compared to Flask/Django (fewer extensions)
- Relatively newer framework (potential breaking changes)
- Learning curve for developers unfamiliar with async/await

**Neutral:**

- Requires Python 3.7+ (acceptable for modern deployment)
- ASGI deployment slightly different from WSGI (Flask/Django)

---

## Decision 2: File Upload Strategy

### Context

Both endpoints require image file uploads:

- `/api/colors/extract` - yarn image (JPG, PNG)
- `/api/garments/recolor` - garment image (JPG, PNG)

Files range from ~100KB (small photos) to 5MB (high-res images). The API needs to:

- Accept file uploads from browsers and programmatic clients
- Validate file type and size before processing
- Pass images to existing `ColorExtractor` and `GarmentRecolorer` classes
- Clean up resources after processing

### Decision

**Approach: multipart/form-data with temporary file storage**

```python
@app.post("/api/colors/extract")
async def extract_colors(
    file: UploadFile = File(...),
    n_colors: int = Form(default=5, ge=1, le=10)
):
    # Read file into memory
    contents = await file.read()

    # Save to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_file:
        temp_file.write(contents)
        temp_path = temp_file.name

    try:
        # Process with existing classes
        extractor = ColorExtractor(image_path=temp_path, n_colors=n_colors)
        colors = extractor.extract_dominant_colors()
        return {"success": True, "colors": colors}
    finally:
        # Clean up
        os.unlink(temp_path)
```

### Rationale

**multipart/form-data:**

- Standard for file uploads in REST APIs
- Supported natively by browsers, curl, requests library
- Allows mixing files with form parameters (`n_colors`, `colors`)
- Works seamlessly with FastAPI's `UploadFile` type

**Temporary File Approach:**

- Existing `ColorExtractor` and `GarmentRecolorer` classes expect file paths
- OpenCV (`cv2.imread()`) and PIL require file paths, not bytes
- Temporary files automatically cleaned up via context manager
- Prevents memory issues with large files

**Memory vs Streaming Trade-offs:**

- Files are small enough (<5MB) to read fully into memory
- Simplifies processing - no need for chunk handling
- Temporary file approach keeps processing logic clean
- Memory usage acceptable: ~10MB per request (file + processing)

### Alternatives Considered

**Base64 Encoding in JSON:**

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "n_colors": 5
}
```

- ❌ Increases payload size by ~33%
- ❌ Not standard for file uploads
- ❌ More complex for frontend developers
- ❌ No native browser support

**Streaming Upload:**

```python
async def extract_colors(file: UploadFile = File(...)):
    async for chunk in file:
        # Process chunks
        pass
```

- ❌ Complex implementation
- ❌ OpenCV doesn't support streaming
- ❌ Unnecessary for small files (<5MB)
- ✅ Would be useful for very large files (>50MB)

**In-Memory Processing Only:**

```python
contents = await file.read()
image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
```

- ❌ Requires refactoring existing classes
- ❌ OpenCV `imdecode()` can be unreliable for some formats
- ❌ More complex error handling
- ✅ Slightly faster (no disk I/O)

### Consequences

**Positive:**

- Works with all HTTP clients (browsers, curl, requests)
- Clean separation: API handles upload, classes handle processing
- Automatic cleanup prevents disk space leaks
- Easy to test with standard tools

**Negative:**

- Temporary files add ~50ms latency per request
- Disk I/O could be bottleneck under high load
- Requires sufficient disk space in `/tmp` directory

**Mitigation:**

- For production: use in-memory temporary files (`io.BytesIO`) if disk I/O becomes bottleneck
- Monitor disk usage in `/tmp`
- Consider moving to in-memory processing if refactoring classes

---

## Decision 3: Color Input Flexibility

### Context

The `/api/garments/recolor` endpoint needs to accept a list of hex color codes. These colors typically come from the `/api/colors/extract` endpoint, but users might also:

- Manually specify colors for testing
- Use colors from external tools (design software, color pickers)
- Test via Swagger UI's form interface

Swagger UI's "Try it out" feature presents form fields as text inputs, making JSON arrays awkward to enter manually.

### Decision

**Support both JSON arrays and comma-separated strings**

```python
@app.post("/api/garments/recolor")
async def recolor_garment(
    file: UploadFile = File(...),
    colors: str = Form(...)  # Accepts both formats
):
    # Parse colors - handle both formats
    try:
        colors_trimmed = colors.strip()

        # Check if it's a JSON array
        if colors_trimmed.startswith('[') and colors_trimmed.endswith(']'):
            color_list = json.loads(colors_trimmed)
        else:
            # Parse as comma-separated string
            color_list = [c.strip() for c in colors_trimmed.split(',')]
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid color format...")
```

**Accepted Formats:**

```python
# JSON array (programmatic use)
'["#142a68", "#23438d", "#0c153b"]'

# Comma-separated (manual entry, Swagger UI)
'#142a68,#23438d,#0c153b'

# Both produce the same result
["#142a68", "#23438d", "#0c153b"]
```

### Rationale

**Developer Experience:**

- Programmatic clients (JavaScript fetch, Python requests) prefer JSON arrays
- JSON arrays match the response format from `/api/colors/extract`
- Manual testing via Swagger UI is easier with comma-separated values

**Workflow Optimization:**

```javascript
// Step 1: Extract colors
const response1 = await fetch('/api/colors/extract', {...});
const { colors } = await response1.json();
// colors = ["#142a68", "#23438d", "#0c153b"]

// Step 2: Recolor garment - direct use
formData.append('colors', JSON.stringify(colors));
// No transformation needed!
```

**Swagger UI Limitation:**

- Form fields display as text inputs: `[input field]`
- Typing JSON arrays manually is error-prone: `["#142a68","#23438d"]`
- Comma-separated is more natural: `#142a68,#23438d`

### Alternatives Considered

**JSON Array Only:**

```python
colors: str = Form(..., description='JSON array: ["#FF0000", "#00FF00"]')
```

- ✅ Clean, single format
- ✅ Type-safe with proper JSON schema
- ❌ Awkward for manual testing
- ❌ Swagger UI users must type valid JSON

**Comma-Separated Only:**

```python
colors: str = Form(..., description='Comma-separated: #FF0000,#00FF00')
```

- ✅ Easy manual entry
- ✅ Clean Swagger UI experience
- ❌ Inconsistent with extract endpoint response
- ❌ Requires transformation in frontend

**Multiple Optional Parameters:**

```python
colors_json: Optional[str] = Form(None)
colors_csv: Optional[str] = Form(None)
```

- ❌ Confusing API design
- ❌ Ambiguous when both provided
- ❌ More complex validation

**Request Body (JSON):**

```python
class RecolorRequest(BaseModel):
    colors: List[str]

@app.post("/api/garments/recolor")
async def recolor_garment(
    file: UploadFile = File(...),
    request: RecolorRequest = Body(...)
):
```

- ❌ Can't mix file upload with JSON body in multipart/form-data
- ❌ Would require two separate requests or base64 encoding
- ❌ Not standard for file upload APIs

### Consequences

**Positive:**

- Seamless developer experience (copy-paste from extract to recolor)
- Easy manual testing via Swagger UI
- Flexible for different client types
- Clear error messages guide users to correct format

**Negative:**

- Slight parsing overhead (~1ms)
- Two code paths to maintain
- Documentation must explain both formats

**Implementation Notes:**

```python
# Validation after parsing
hex_pattern = re.compile(r'^#[0-9A-Fa-f]{6}$')
invalid_colors = [c for c in color_list if not hex_pattern.match(c)]
if invalid_colors:
    raise HTTPException(
        status_code=400,
        detail=f"Invalid hex color format: {invalid_colors}"
    )
```

---

## Decision 4: Error Handling Design

### Context

The API must handle various error conditions:

- Invalid file types (PDF, TXT instead of images)
- Files exceeding size limits
- Corrupted or unreadable images
- Invalid color formats
- Processing failures (background removal, K-means clustering)

Error responses need to:

- Clearly indicate what went wrong
- Guide users to correct the issue
- Use appropriate HTTP status codes
- Provide actionable error messages

### Decision

**Three-Layer Validation Approach with Specific Status Codes**

```python
# Layer 1: Input Validation (Before Processing)
# Status: 400 Bad Request

# 1a. File Type Validation
if not file.content_type or not file.content_type.startswith("image/"):
    raise HTTPException(
        status_code=400,
        detail=f"Invalid file type: {file.content_type}. Please upload an image (JPG, PNG)."
    )

# Layer 2: Size Validation
# Status: 413 Payload Too Large
if file.size and file.size > MAX_FILE_SIZE:
    size_mb = file.size / (1024 * 1024)
    raise HTTPException(
        status_code=413,
        detail=f"File too large: {size_mb:.2f}MB. Maximum allowed: 5MB."
    )

# Layer 3: Processing Validation (After Processing)
# Status: 400 Bad Request (invalid input) or 500 (server error)
if not colors:
    raise HTTPException(
        status_code=400,
        detail="Could not extract colors from image. The file may be corrupted or invalid."
    )
```

### Rationale

**HTTP Status Code Strategy:**

| Code | When         | Meaning                        | Example                              |
| ---- | ------------ | ------------------------------ | ------------------------------------ |
| 400  | Client Error | Invalid request format/data    | Wrong file type, invalid hex code    |
| 413  | Client Error | Request entity too large       | File exceeds 5MB                     |
| 422  | Client Error | Missing required field         | No file uploaded (FastAPI automatic) |
| 500  | Server Error | Processing failed unexpectedly | OpenCV crash, out of memory          |

**User-Friendly Messages:**

- Specific: "File too large: 7.23MB" vs generic "Bad request"
- Actionable: "Please upload an image (JPG, PNG)" vs "Invalid input"
- Contextual: Shows actual values (file size, color format)

**Progressive Validation:**

```
Request → File Type → File Size → Processing → Response
           ↓           ↓            ↓
         400 Bad    413 Too     400/500
         Request    Large      Depending
```

### Error Message Examples

**Good (Current Implementation):**

```json
{
  "detail": "File too large: 7.23MB. Maximum allowed: 5MB."
}
```

- Shows actual file size
- States the limit
- Clear action: reduce file size

**Bad (Avoided):**

```json
{
  "error": "Request failed",
  "code": 400
}
```

- No context
- No guidance
- Frustrating for developers

### Alternatives Considered

**Single Status Code (400 for all client errors):**

```python
# All errors return 400
raise HTTPException(status_code=400, detail="...")
```

- ❌ Loses semantic meaning
- ❌ Harder for clients to handle different error types
- ❌ Not RESTful convention
- ✅ Simpler implementation

**Detailed Error Codes:**

```python
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "...",
    "field": "file",
    "limit": "5MB"
  }
}
```

- ✅ Machine-readable error codes
- ✅ Structured error details
- ❌ Overkill for simple API
- ❌ More complex to consume

**Exception Classes:**

```python
class FileTooLargeError(Exception):
    def __init__(self, size_mb, limit_mb):
        self.size_mb = size_mb
        self.limit_mb = limit_mb

@app.exception_handler(FileTooLargeError)
async def handle_file_too_large(request, exc):
    return JSONResponse(
        status_code=413,
        content={"detail": f"File too large: {exc.size_mb}MB..."}
    )
```

- ✅ Clean separation of concerns
- ✅ Reusable error handling
- ❌ More boilerplate code
- ❌ Unnecessary for two endpoints

### Consequences

**Positive:**

- Frontend developers can programmatically handle different error types
- Clear error messages reduce support requests
- Validation happens early, saving processing time
- HTTP status codes follow REST conventions

**Negative:**

- Must manually construct error messages
- Need to handle validation in multiple places
- More code to maintain vs simpler "catch all" approach

**Frontend Error Handling Example:**

```javascript
try {
  const response = await fetch('/api/colors/extract', {...});
  if (!response.ok) {
    const error = await response.json();

    // Handle specific errors
    if (response.status === 413) {
      alert('File is too large. Please upload an image under 5MB.');
    } else if (response.status === 400) {
      alert(`Invalid input: ${error.detail}`);
    }
  }
} catch (error) {
  console.error('Request failed:', error);
}
```

---

## Decision 5: Response Format Decisions

### Context

API endpoints need to return results in formats that are:

- Easy for frontend developers to consume
- Efficient for network transfer
- Compatible with common HTTP clients
- Consistent with REST API conventions

Two endpoints with different response needs:

1. `/api/colors/extract` - Returns data (color array)
2. `/api/garments/recolor` - Returns an image file

### Decision

**Endpoint-Specific Response Formats**

#### Color Extraction: JSON Response

```python
@app.post("/api/colors/extract")
async def extract_colors(...):
    return {
        "success": True,
        "colors": ["#142a68", "#23438d", "#0c153b"],
        "count": 3,
        "filename": "yarn.jpg"
    }
```

**Response Type:** `application/json`

#### Garment Recoloring: Binary Image Response

```python
@app.post("/api/garments/recolor")
async def recolor_garment(...):
    # Read image into memory
    with open(output_path, 'rb') as f:
        image_data = f.read()

    return Response(
        content=image_data,
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="recolored_{file.filename}"'
        }
    )
```

**Response Type:** `image/png`

### Rationale

**Color Extraction as JSON:**

- Colors are structured data (array of strings)
- Frontend needs to manipulate/display colors
- JSON is standard for REST APIs
- Easy to parse in all languages

**Garment Recolor as Binary:**

- Image data is inherently binary
- Browsers can display PNG directly
- Smaller payload than base64 encoding
- Standard for image APIs

**Why Binary Response vs Alternatives:**

| Approach                | Pros                              | Cons                          | Size (1MB image) |
| ----------------------- | --------------------------------- | ----------------------------- | ---------------- |
| **Binary PNG** (chosen) | Native browser support, efficient | Needs blob handling           | 1.0 MB           |
| Base64 in JSON          | Easy parsing                      | 33% larger, encoding overhead | 1.33 MB          |
| FileResponse            | Streaming support                 | More complex setup            | 1.0 MB           |
| Presigned URL           | Offload to storage                | Requires cloud storage        | N/A              |

### Implementation Details

**Binary Response:**

```python
return Response(
    content=image_data,          # Raw PNG bytes
    media_type="image/png",      # Browser knows it's an image
    headers={
        "Content-Disposition": f'attachment; filename="recolored_sweater.jpg"'
        # ↑ Suggests filename for downloads
    }
)
```

**Frontend Consumption:**

```javascript
// Fetch the image
const response = await fetch('/api/garments/recolor', {...});
const imageBlob = await response.blob();

// Display in browser
const imageUrl = URL.createObjectURL(imageBlob);
document.querySelector('#result').src = imageUrl;

// Or download
const link = document.createElement('a');
link.href = imageUrl;
link.download = 'recolored.png';
link.click();
```

### Alternatives Considered

**Base64 in JSON:**

```python
import base64

return {
    "success": True,
    "image": f"data:image/png;base64,{base64.b64encode(image_data).decode()}",
    "filename": "recolored.png"
}
```

- ❌ 33% size increase (base64 overhead)
- ❌ Encoding/decoding CPU overhead
- ❌ Can't use `<img src="url">` directly
- ✅ Easier JSON parsing
- ✅ No blob handling needed

**FileResponse (Streaming):**

```python
from fastapi.responses import FileResponse

return FileResponse(
    output_path,
    media_type="image/png",
    filename="recolored.png"
)
```

- ✅ More efficient for large files (streaming)
- ✅ FastAPI handles cleanup
- ❌ Can't delete temp file immediately
- ❌ More complex error handling
- ❌ Unnecessary for small images (<5MB)

**Presigned URL (Cloud Storage):**

```python
# Upload to S3/GCS, return URL
return {
    "success": True,
    "image_url": "https://storage.googleapis.com/chromaknit/recolored_abc123.png",
    "expires_in": 3600
}
```

- ✅ Offloads serving to CDN
- ✅ Reduces API server bandwidth
- ❌ Requires cloud storage setup
- ❌ Additional costs
- ❌ More complex architecture
- ✅ Good for production at scale

**Separate GET Endpoint:**

```python
# POST returns job ID
@app.post("/api/garments/recolor")
async def recolor_garment(...):
    return {"job_id": "abc123", "status": "processing"}

# GET retrieves result
@app.get("/api/garments/result/{job_id}")
async def get_result(job_id: str):
    return Response(content=image_data, media_type="image/png")
```

- ✅ Better for long-running processes
- ✅ Enables async processing
- ❌ More complex client implementation
- ❌ Requires job tracking/storage
- ❌ Overkill for fast processing (<15s)

### Filename Convention

```python
headers={
    "Content-Disposition": f'attachment; filename="recolored_{file.filename}"'
}
```

**Pattern:** `recolored_{original_filename}`

**Rationale:**

- Preserves original filename for context
- `recolored_` prefix indicates processing
- Browser suggests this name for downloads
- Avoids filename collisions

**Examples:**

- `sweater.jpg` → `recolored_sweater.jpg`
- `blue_cardigan.png` → `recolored_blue_cardigan.png`

### Consequences

**Positive:**

- Efficient network transfer (no base64 overhead)
- Native browser image display support
- Standard REST API patterns
- Clear separation: data as JSON, media as binary

**Negative:**

- Frontend needs blob handling code
- Different response types require different parsing
- Can't easily inspect image in JSON viewers

**Performance:**

- Binary response: ~1MB for typical image
- Base64 alternative: ~1.33MB (33% larger)
- Bandwidth savings: 330KB per request

---

## Decision 6: Future Considerations

### Context

The current API implementation (Phase 2) is designed for MVP and development. Future phases will require:

- Production deployment with multiple concurrent users
- Security and access control
- Performance optimization
- Scalability improvements

This section documents planned architectural improvements without implementing them in Phase 2.

---

### 6.1 Rate Limiting

**Current State:** No rate limiting

**Problem:**

- Users can overwhelm server with requests
- Processing-intensive operations (background removal) take 5-15 seconds
- Single user can monopolize resources

**Proposed Solution:**

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/api/colors/extract")
@limiter.limit("20/minute")  # 20 requests per minute per IP
async def extract_colors(...):
    ...

@app.post("/api/garments/recolor")
@limiter.limit("10/minute")  # Lower limit for expensive operation
async def recolor_garment(...):
    ...
```

**Alternatives:**

- **API Gateway (AWS API Gateway, Kong):** Offload rate limiting to infrastructure
- **Redis-based:** Distributed rate limiting across multiple servers
- **Token bucket:** More flexible, allows bursts

**Considerations:**

- Rate limit by IP address initially
- Consider user-based limits after authentication
- Different limits for different endpoints
- Provide clear error messages with retry-after headers

---

### 6.2 Authentication & Authorization

**Current State:** Open API, no authentication

**Problem:**

- Anyone can use API
- No usage tracking per user
- No way to implement quotas
- Potential abuse

**Proposed Strategy:**

**Option A: API Key Authentication**

```python
from fastapi import Security, HTTPException
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key")

def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key not in VALID_API_KEYS:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key

@app.post("/api/colors/extract")
async def extract_colors(
    api_key: str = Security(verify_api_key),
    ...
):
    ...
```

**Option B: OAuth 2.0 / JWT**

```python
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@app.post("/api/colors/extract")
async def extract_colors(
    token: str = Depends(oauth2_scheme),
    ...
):
    # Verify JWT token
    user = verify_token(token)
    ...
```

**Option C: Session-Based (Cookie)**

- Best for web-only application
- Simpler implementation
- Requires CORS configuration

**Recommendation:** Start with API keys (simplest), migrate to JWT for production

**Considerations:**

- Store API keys in environment variables / secret manager
- Implement key rotation
- Rate limits per API key
- Usage tracking and analytics
- Free tier vs paid tiers

---

### 6.3 Caching Opportunities

**Current State:** No caching

**Opportunities:**

**1. Color Extraction Results**

```python
import hashlib
from functools import lru_cache

def get_file_hash(file_data: bytes) -> str:
    return hashlib.md5(file_data).hexdigest()

# Cache in Redis
@app.post("/api/colors/extract")
async def extract_colors(file: UploadFile, n_colors: int):
    file_data = await file.read()
    cache_key = f"colors:{get_file_hash(file_data)}:{n_colors}"

    # Check cache
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # Process and cache
    colors = extract_dominant_colors(...)
    redis_client.setex(cache_key, 3600, json.dumps(colors))  # 1 hour TTL
    return colors
```

**Benefits:**

- Same yarn image → instant response
- Reduce server load
- Better user experience

**Considerations:**

- Cache hit rate likely low (each yarn is unique)
- Memory usage for cache storage
- Invalidation strategy

**2. Recolored Garment Images**

```python
cache_key = f"recolor:{garment_hash}:{colors_hash}"
```

**Benefits:**

- Same garment + colors → instant response
- Expensive operation (10s) becomes instant

**Considerations:**

- Large cache size (images are ~1MB each)
- Low hit rate (unique combinations)
- Better suited for CDN caching after cloud storage

**3. rembg Model Caching**

- Model loads on first request (~10s delay)
- Keep model in memory between requests
- Already handled by rembg library

---

### 6.4 Background Task Processing

**Current State:** Synchronous processing blocks request

**Problem:**

- Garment recoloring takes 5-15 seconds
- Client must wait for entire process
- Poor UX for large images
- Server thread blocked during processing

**Proposed Architecture:**

```python
from fastapi import BackgroundTasks
from celery import Celery

celery_app = Celery('chromaknit', broker='redis://localhost:6379')

@celery_app.task
def recolor_garment_task(garment_path, colors, job_id):
    recolorer = GarmentRecolorer(garment_path)
    result = recolorer.recolor_garment(colors)

    # Save to storage
    upload_to_s3(result, job_id)

    # Update job status
    redis_client.set(f"job:{job_id}", "completed")

@app.post("/api/garments/recolor")
async def recolor_garment(file: UploadFile, colors: str):
    job_id = str(uuid.uuid4())

    # Save file temporarily
    temp_path = save_temp_file(file)

    # Queue background task
    recolor_garment_task.delay(temp_path, colors, job_id)

    return {
        "job_id": job_id,
        "status": "processing",
        "status_url": f"/api/jobs/{job_id}"
    }

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    status = redis_client.get(f"job:{job_id}")

    if status == "completed":
        return {
            "status": "completed",
            "result_url": f"https://cdn.chromaknit.com/results/{job_id}.png"
        }
    else:
        return {"status": "processing"}
```

**Alternatives:**

- **FastAPI BackgroundTasks:** Simple, single-server only
- **Celery + Redis:** Distributed, scalable, complex setup
- **AWS Lambda:** Serverless, auto-scaling, cold start issues
- **RabbitMQ + Workers:** More complex than Redis

**Frontend Integration:**

```javascript
// Submit job
const { job_id } = await submitRecolorJob(file, colors);

// Poll for completion
const pollInterval = setInterval(async () => {
  const status = await checkJobStatus(job_id);

  if (status === "completed") {
    clearInterval(pollInterval);
    displayResult(status.result_url);
  }
}, 2000);
```

**Considerations:**

- Adds complexity (message broker, worker processes)
- Requires job status tracking
- Better user experience for slow operations
- Enables horizontal scaling

**When to Implement:**

- Processing time regularly exceeds 15 seconds
- Need to handle 10+ concurrent requests
- Users complaining about timeouts

---

### 6.5 Storage Strategy

**Current State:** Return images directly in response

**Future Options:**

**Option A: Cloud Storage (S3/GCS) + CDN**

```python
import boto3

s3 = boto3.client('s3')

@app.post("/api/garments/recolor")
async def recolor_garment(...):
    # Process image
    recolored_image = recolor_garment(...)

    # Upload to S3
    key = f"results/{uuid.uuid4()}.png"
    s3.upload_fileobj(recolored_image, 'chromaknit-results', key)

    # Generate presigned URL (24 hour expiry)
    url = s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': 'chromaknit-results', 'Key': key},
        ExpiresIn=86400
    )

    return {"result_url": url, "expires_in": 86400}
```

**Benefits:**

- Offload serving to CDN
- Reduce API server bandwidth
- Enable result sharing via URL
- Automatic backups and redundancy

**Costs:**

- S3 storage: ~$0.023/GB/month
- CloudFront CDN: ~$0.085/GB transfer
- ~100 requests/day = ~3GB/month = ~$0.35/month

**Option B: Database Storage**

```python
# Store in PostgreSQL with BYTEA
result = {
    "job_id": job_id,
    "image_data": recolored_image.tobytes(),
    "created_at": datetime.now()
}
db.execute("INSERT INTO results (...) VALUES (...)", result)
```

**Benefits:**

- Simple, no external dependencies
- Transaction support

**Drawbacks:**

- Database bloat (images are large)
- Slower retrieval than object storage
- Expensive backups

**Recommendation:** Use cloud storage for production

---

### 6.6 Monitoring & Observability

**Current State:** Basic logging to console

**Future Implementation:**

```python
import logging
from prometheus_client import Counter, Histogram

# Metrics
color_extraction_requests = Counter(
    'color_extraction_requests_total',
    'Total color extraction requests'
)

processing_duration = Histogram(
    'processing_duration_seconds',
    'Processing duration',
    ['endpoint']
)

# Structured logging
logger = logging.getLogger('chromaknit')

@app.post("/api/colors/extract")
async def extract_colors(...):
    start_time = time.time()

    try:
        colors = extract_dominant_colors(...)
        color_extraction_requests.inc()

        logger.info(
            "color_extraction_success",
            extra={
                "n_colors": len(colors),
                "filename": file.filename,
                "duration_ms": (time.time() - start_time) * 1000
            }
        )

        return {"colors": colors}

    finally:
        processing_duration.labels(endpoint='extract').observe(
            time.time() - start_time
        )
```

**Monitoring Tools:**

- **Prometheus + Grafana:** Metrics and dashboards
- **Sentry:** Error tracking and alerting
- **DataDog / New Relic:** Application performance monitoring
- **CloudWatch:** AWS native monitoring

**Key Metrics to Track:**

- Request rate (requests/minute)
- Processing duration (p50, p95, p99)
- Error rate by type
- File size distribution
- Success/failure ratio

---

## Summary of Design Decisions

| Decision            | Choice                                     | Key Rationale                               |
| ------------------- | ------------------------------------------ | ------------------------------------------- |
| **Framework**       | FastAPI                                    | Auto-docs, performance, type safety         |
| **File Upload**     | multipart/form-data + temp files           | Standard, compatible with existing classes  |
| **Color Input**     | JSON array + CSV support                   | Developer experience + Swagger UI usability |
| **Error Handling**  | 3-layer validation + specific status codes | Clear, actionable error messages            |
| **Response Format** | JSON for data, binary for images           | Efficient, standard patterns                |

---

## Related Documents

- [ADR 001: Color Extraction Algorithm](001-color-extraction-algorithm.md)
- [ADR 002: Background Removal Strategy](002-background-removal-strategy.md)
- [API Documentation](../api/README.md)
- [ChromaKnit README](../../README.md)

---

## Changelog

| Date    | Change                                  | Author      |
| ------- | --------------------------------------- | ----------- |
| 2024-12 | Initial API design decisions documented | Joyce Chong |

---

**Next Review:** Before Phase 3 (Frontend Development)  
**Last Updated:** December 2024
