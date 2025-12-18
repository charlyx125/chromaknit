# 🧶 ChromaKnit

Transform garment colors using yarn photos - An intelligent color extraction and garment recoloring system for knitters and designers.

## 📖 Overview

ChromaKnit helps knitters and designers visualize how their yarn colors would look on garments. Upload a photo of your yarn, and ChromaKnit will:

- Extract dominant colors from the yarn using K-means clustering
- Remove backgrounds from garment images automatically
- Recolor garments realistically while preserving texture, shadows, and lighting
- Apply multiple yarn colors for natural-looking results

**Problem it solves:** Knitters often struggle to visualize how their yarn will look when knitted into a specific pattern or garment design. ChromaKnit bridges this gap by providing realistic color previews.

## ✨ Features

### ✅ Phase 1 Complete: Core Processing Engine

**Intelligent Color Extraction**

- K-means clustering for dominant color detection
- Frequency-based color sorting
- Hex code output for easy reference
- Visual color palette generation

**Advanced Garment Recoloring**

- Automatic background removal using AI (rembg)
- HSV color space transformation for realistic results
- Texture and lighting preservation
- Multi-color distribution based on brightness
- Shadow and highlight retention

**Production-Ready Quality**

- Comprehensive test suite (23+ tests for ColorExtractor, 15+ tests for GarmentRecolorer)
- 89-99% code coverage
- Performance benchmarking
- CI/CD with GitHub Actions
- Clean, modular architecture

### ✅ Phase 2 Complete: Backend API

**RESTful API with FastAPI**

- `/api/colors/extract` - Extract dominant colors from yarn images
- `/api/garments/recolor` - Recolor garments with color palettes
- Automatic interactive documentation (Swagger UI)
- Comprehensive error handling with helpful messages
- File upload validation (type, size)
- Flexible input formats (JSON arrays or comma-separated values)

**API Features**

- File size limits (5MB max)
- Multiple input format support
- Proper HTTP status codes (200, 400, 413, 500)
- Temporary file cleanup
- Memory-efficient image processing

### 🚧 Phase 3: Frontend Interface (Planned)

- React web application
- Drag-and-drop image upload
- Real-time color preview
- Responsive design

### 📅 Phase 4: Production Deployment (Planned)

- Backend deployment (Railway/Render)
- Frontend deployment (Vercel/Netlify)
- Performance optimizations
- Production monitoring

## 🎨 Results

### Example: Blue Yarn → Yellow Cardigan

| Input Yarn                             | Extracted Colors                                 |
| -------------------------------------- | ------------------------------------------------ |
| ![Blue Yarn](examples/sample-yarn.jpg) | ![Color Palette](results/sample-yarn-colors.png) |

| Original Garment                                | Recolored Result                                |
| ----------------------------------------------- | ----------------------------------------------- |
| ![Yellow Cardigan](examples/sample-garment.jpg) | ![Blue Cardigan](results/recolored_garment.png) |

_Original garment image from Wool and the Gang_

The yellow cardigan was successfully transformed to blue while **preserving all knit texture, shadows, and folds**!

### Try It Yourself

```bash
# Start the API
uvicorn api.main:app --reload

# Visit http://127.0.0.1:8000/docs
# 1. Upload yarn image to /api/colors/extract
# 2. Upload garment image to /api/garments/recolor with extracted colors
# 3. Download your recolored garment!
```

## 🏗️ Architecture

```
chromaknit/
├── core/
│   ├── yarn_color_extractor.py  # Color extraction from yarn images
│   ├── garment_recolor.py       # Garment recoloring with texture preservation
│   └── utils.py                 # Shared utilities (color conversion, printing)
├── api/
│   └── main.py                  # FastAPI REST endpoints
├── tests/
│   ├── test_color_extractor.py  # 23 tests, 99% coverage
│   ├── test_garment_recolor.py  # 15 tests, 89% coverage
│   └── test_utils.py            # Utility function tests
├── benchmarks/
│   └── benchmark_color_extractor.py  # Performance testing
├── examples/                    # Sample images
├── results/                     # Output directory
└── main.py                      # Demo workflow
```

## 🛠️ Tech Stack

**Core Technologies:**

- Python 3.11+ - Primary language
- OpenCV - Image processing
- NumPy - Numerical operations
- scikit-learn - K-means clustering
- rembg - AI-powered background removal
- onnxruntime - ML model execution (required by rembg)
- matplotlib - Visualization

**API:**

- FastAPI - Modern Python web framework
- Uvicorn - ASGI server
- Pydantic - Data validation

**Development Tools:**

- pytest - Testing framework
- pytest-cov - Code coverage
- GitHub Actions - CI/CD pipeline

## 🚀 Getting Started

### Prerequisites

- Python 3.11 or higher
- pip (Python package manager)

### Installation

1. **Clone the repository:**

```bash
git clone https://github.com/charlyx125/chromaknit.git
cd chromaknit
```

2. **Create virtual environment:**

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

3. **Install dependencies:**

**For core functionality only:**

```bash
pip install -r requirements.txt
```

**For API server (recommended):**

```bash
pip install -r requirements-api.txt
```

**For development (includes testing tools):**

```bash
pip install -r requirements-api.txt -r requirements-dev.txt
```

## 💻 Usage

### Option 1: Use the REST API (Recommended)

**Start the API server:**

```bash
uvicorn api.main:app --reload
```

**Access interactive documentation:**

- Swagger UI: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc

**API Workflow:**

1. **Extract colors from yarn:**

   - POST to `/api/colors/extract`
   - Upload yarn image
   - Receive color palette: `["#142a68", "#23438d", "#0c153b"]`

2. **Recolor garment:**
   - POST to `/api/garments/recolor`
   - Upload garment image
   - Provide colors (JSON array or comma-separated)
   - Download recolored garment

**Example with curl:**

```bash
# Extract colors
curl -X POST "http://127.0.0.1:8000/api/colors/extract" \
  -F "file=@examples/sample-yarn.jpg" \
  -F "n_colors=5"

# Recolor garment
curl -X POST "http://127.0.0.1:8000/api/garments/recolor" \
  -F "file=@examples/sample-garment.jpg" \
  -F "colors=#142a68,#23438d,#0c153b" \
  --output recolored.png
```

### Option 2: Use Python Directly

**Extract Colors from Yarn:**

```python
from core.yarn_color_extractor import ColorExtractor

# Extract 5 dominant colors
extractor = ColorExtractor(image_path="yarn.jpg", n_colors=5)
colors = extractor.extract_dominant_colors()

# Visualize results
extractor.visualize_colors(output_path="results/colors.png")

print(colors)  # ['#142a68', '#23438d', '#0c153b', '#3e64b2', '#658ad6']
```

**Recolor a Garment:**

```python
from core.garment_recolor import GarmentRecolorer

# Create recolorer
recolorer = GarmentRecolorer(garment_image_path="sweater.jpg")

# Recolor with extracted yarn colors
recolored_image = recolorer.recolor_garment(target_colors=colors)

# Save result
recolorer.save_result(output_path="results/recolored_sweater.png")
```

**Full Workflow:**

```python
# 1. Extract colors from yarn
extractor = ColorExtractor("yarn.jpg", n_colors=5)
yarn_colors = extractor.extract_dominant_colors()

# 2. Recolor garment
recolorer = GarmentRecolorer("garment.jpg")
recolored = recolorer.recolor_garment(yarn_colors)

# 3. Save results
recolorer.save_result("output.png")
```

### Option 3: Run the Demo

```bash
python main.py
```

This will:

- Extract colors from `examples/sample-yarn.jpg`
- Recolor `examples/sample-garment.jpg`
- Save results to `results/` folder

## 🧪 Testing

**Run all tests:**

```bash
pytest tests/ -v
```

**Test with coverage:**

```bash
pytest tests/ --cov=core --cov-report=term-missing
```

**Run specific test suite:**

```bash
pytest tests/test_color_extractor.py -v
pytest tests/test_garment_recolor.py -v
```

**Performance benchmarks:**

```bash
python benchmarks/benchmark_color_extractor.py
```

Expected output:

```
Size       Dimensions   Pixels        Time (s)
--------------------------------------------------
Small      300x300          90,000     0.234
Medium     800x800         640,000     1.456
Large      1920x1080     2,073,600     3.892
```

## 📊 Technical Approach

### Color Extraction

- **Algorithm:** K-means clustering in RGB space
- **Optimization:** Configurable cluster count, random seed for reproducibility
- **Output:** Sorted by frequency, hex codes with percentages

### Garment Recoloring

- **Color Space:** HSV (Hue, Saturation, Value)
  - H: Changed to yarn color hue
  - S: Changed to yarn color saturation
  - V: Preserved from original (maintains texture/lighting!)
- **Multi-Color:** Brightness-based distribution (dark areas → dark yarn colors)
- **Background Removal:** rembg with U²-Net model

### API Design

- **Layered validation:** File type → File size → Processing quality
- **Flexible input:** Accepts JSON arrays or comma-separated color values
- **Proper HTTP semantics:** Uses appropriate status codes (200, 400, 413, 500)
- **Memory efficient:** Streams large files, temporary file cleanup

## ⚠️ Known Limitations

- **Foreground Detection:** Currently recolors all detected foreground objects (may include person, not just garment)
- **Best Results:** Works optimally with solid-colored garments on simple backgrounds
- **Processing Time:** Background removal can take 5-10 seconds for large images
- **Color Distribution:** Simple brightness-based mapping (future: more sophisticated algorithms)
- **File Size Limit:** 5MB maximum for API uploads

## 🗺️ Roadmap

### ✅ Phase 1: Core Processing (Complete)

- ✅ Color extraction from yarn images
- ✅ Garment recoloring with texture preservation
- ✅ Comprehensive test suite
- ✅ Performance benchmarks
- ✅ CI/CD pipeline

### ✅ Phase 2: Backend API (Complete)

- ✅ FastAPI REST endpoints
- ✅ File upload handling
- ✅ Request/response validation
- ✅ API documentation (Swagger/ReDoc)
- ✅ Error handling with helpful messages
- ✅ Flexible input format support

### 📅 Phase 3: Frontend Interface (Planned)

- React web application
- Drag-and-drop image upload
- Real-time color preview
- Responsive design
- Gallery of recolored garments

### 📅 Phase 4: Production Deployment (Planned)

- Backend deployment (Railway/Render)
- Frontend deployment (Vercel/Netlify)
- Performance optimizations
- Production monitoring
- Rate limiting
- User authentication (optional)

## 🤝 Contributing

This is a personal learning project, but feedback and suggestions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is open source and available under the MIT License.

## 👤 Author

**Joyce Chong**

- GitHub: [@charlyx125](https://github.com/charlyx125)
- Project: [ChromaKnit](https://github.com/charlyx125/chromaknit)

## 🙏 Acknowledgments

- [scikit-learn](https://scikit-learn.org/) - K-means clustering implementation
- [rembg](https://github.com/danielgatis/rembg) - AI-powered background removal
- [OpenCV](https://opencv.org/) - Computer vision tools
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- Inspiration from the knitting and maker community

## 📚 Documentation

For detailed technical decisions and architecture documentation, see:

- `docs/decisions/001-color-extraction-algorithm.md`
- `docs/decisions/002-background-removal-strategy.md`

---

Built with ❤️ for knitters and designers
