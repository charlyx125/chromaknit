# 🧶 ChromaKnit

**Visualize how your yarn will look on any garment — before you knit a single stitch.**

![ChromaKnit Demo](examples/E2E-demo.gif)

Upload yarn photo → Extract colors automatically → Recolor any garment

---

## The Problem

Knitters spend hours (and money) on yarn, only to discover the finished garment doesn't look how they imagined. ChromaKnit lets you preview yarn colors on garments *before* committing to a project.

## ✨ Features

| Feature | Description | Details |
|---------|-------------|---------|
| **Color Extraction** | K-means clustering extracts dominant colors from yarn photos | [ADR 001](docs/decisions/001-color-filtering-strategy.md) |
| **Background Removal** | AI-powered segmentation (rembg/U²-Net) isolates garments | [ADR 002](docs/decisions/002-background-removal.md) |
| **Realistic Recoloring** | HSV transformation preserves texture, shadows, and lighting | [ADR 002](docs/decisions/002-background-removal.md) |
| **REST API** | FastAPI endpoints with Swagger docs at `/docs` | [ADR 003](docs/decisions/003-api-design.md) |
| **React Frontend** | TypeScript + Vite with real-time color extraction | [ADR 004](docs/decisions/004-react-frontend-architecture.md) |

**Status:** ✅ Phases 1-3 Complete | 📅 Phase 4 (Production Deployment) Planned

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

## 🏗️ Architecture
```
chromaknit/
├── core/
│   ├── yarn_color_extractor.py  # Color extraction from yarn images
│   ├── garment_recolor.py       # Garment recoloring with texture preservation
│   └── utils.py                 # Shared utilities (color conversion, printing)
├── api/
│   └── main.py                  # FastAPI REST endpoints with CORS
├── chromaknit-frontend/         # React frontend
│   ├── src/
│   │   ├── App.tsx              # Main application component
│   │   ├── ImageUpload.tsx      # Reusable file upload component
│   │   ├── App.css              # Application styles
│   │   ├── main.tsx             # React entry point
│   │   └── index.css            # Global styles
│   ├── package.json             # Node dependencies
│   ├── tsconfig.json            # TypeScript configuration
│   ├── vite.config.ts           # Vite build configuration
│   └── index.html               # HTML shell
├── tests/
│   ├── test_color_extractor.py  # Color extraction tests
│   ├── test_garment_recolor.py  # Garment recoloring tests
│   └── test_utils.py            # Utility function tests
├── benchmarks/
│   ├── benchmark_color_extractor.py  # Color extraction benchmarks
│   ├── benchmark_recolor_garment.py  # Recoloring benchmarks
│   ├── benchmark_full_workflow.py    # End-to-end workflow benchmarks
│   └── workflow_results.md           # Latest benchmark results
├── examples/                    # Sample images
├── results/                     # Output directory
└── main.py                      # Demo workflow
```

## 🛠️ Tech Stack

**Backend:**

- Python 3.11+ - Primary language
- FastAPI - Modern web framework with auto-docs
- OpenCV - Image processing
- NumPy - Numerical operations
- scikit-learn - K-means clustering
- rembg - AI-powered background removal
- Uvicorn - ASGI server

**Frontend:**

- React 18 - UI library
- TypeScript - Type safety and better DX
- Vite - Lightning-fast build tool and dev server
- CSS3 - Custom styling with modern features

**Development Tools:**

- pytest - Testing framework
- pytest-cov - Code coverage
- GitHub Actions - CI/CD pipeline
- Git - Version control

## 🚀 Getting Started

### Prerequisites

- Python 3.11 or higher
- Node.js 18+ and npm
- pip (Python package manager)

### Backend Setup

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
```bash
pip install -r requirements-api.txt
```

4. **Start API server:**
```bash
uvicorn api.main:app --reload
```

**API available at:** http://localhost:8000  
**Interactive docs:** http://localhost:8000/docs

### Frontend Setup

1. **Navigate to frontend directory:**
```bash
cd chromaknit-frontend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Start development server:**
```bash
npm run dev
```

**Frontend available at:** http://localhost:5173

### Full Stack Development

**For the complete development experience, run both servers:**

**Terminal 1 - Backend:**
```bash
cd chromaknit
source venv/bin/activate  # Windows: venv\Scripts\activate
uvicorn api.main:app --reload
```

**Terminal 2 - Frontend:**
```bash
cd chromaknit-frontend
npm run dev
```

**Benefits:**
- ⚡ Hot reload on both frontend and backend
- 🔄 Real-time API integration
- 🎨 Instant visual feedback
- 🐛 Easy debugging across the stack

**Open browser:** http://localhost:5173

## 💻 Usage

### Option 1: Web Interface (Recommended)

1. **Start both servers** (see Full Stack Development above)
2. **Open http://localhost:5173 in browser**
3. **Upload yarn image:**
   - Click upload area or drag-and-drop
   - See image preview
   - Colors extracted automatically
4. **View color palette:**
   - Visual color boxes
   - Hover to see hex codes
5. **Upload garment:**
   - Click upload or drag-and-drop
   - See image preview
6. **Click "Recolor Garment":**
   - View original and recolored side-by-side
7. **Start Over:** Reset to try new images

### Option 2: Use the REST API Directly

**Start API server:**
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
   - Receive: `{"success": true, "colors": ["#142a68", "#23438d"], "count": 2}`

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

### Option 3: Use Python Directly

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

## 🧪 Testing

**Backend tests:**
```bash
# Run all tests
pytest tests/ -v

# Test with coverage
pytest tests/ --cov=core --cov=api --cov-report=term-missing

# Run specific test suite
pytest tests/test_color_extractor.py -v
```

**Frontend development:**
```bash
cd chromaknit-frontend

# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📊 Technical Approach

### Color Extraction ([ADR 001](docs/decisions/001-color-filtering-strategy.md))

- **Algorithm:** K-means clustering in RGB space
- **Optimization:** Configurable cluster count, random seed for reproducibility
- **Output:** Sorted by frequency, hex codes with percentages

### Garment Recoloring ([ADR 002](docs/decisions/002-background-removal.md))

- **Color Space:** HSV (Hue, Saturation, Value)
  - H: Changed to yarn color hue
  - S: Changed to yarn color saturation
  - V: Preserved from original (maintains texture/lighting!)
- **Multi-Color:** Brightness-based distribution (dark areas → dark yarn colors)
- **Background Removal:** rembg with U²-Net model

### Frontend Architecture ([ADR 004](docs/decisions/004-react-frontend-architecture.md))

- **Component-Based:** Reusable ImageUpload component with TypeScript props
- **State Management:** React hooks (useState, useEffect) for reactive UI
- **API Integration:** Fetch API with async/await and error handling
- **Real-Time Updates:** Automatic color extraction on upload
- **Type Safety:** Full TypeScript coverage for compile-time error detection

### API Design ([ADR 003](docs/decisions/003-api-design.md))

- **Layered validation:** File type → File size → Processing quality
- **Flexible input:** Accepts JSON arrays or comma-separated color values
- **Proper HTTP semantics:** Uses appropriate status codes (200, 400, 413, 500)
- **Memory efficient:** Streams large files, temporary file cleanup
- **CORS configured:** Allows frontend-backend communication during development

## ⚡ Performance Benchmarks ([ADR 005](docs/decisions/005-performance-optimization-strategy.md))

**Test Environment:**
- Machine: LG GRAM
- Test Date: February 2026
- Methodology: Synthetic test images, timed operations with psutil memory tracking

### Individual Operations

| Operation | Small (300x300) | Medium (800x800) | Large (1920x1080) |
|-----------|-----------------|------------------|-------------------|
| Color Extraction | 3.382s | 3.797s | 7.014s |
| Garment Recoloring | 1.746s | 1.863s | 1.766s |
| **Partial Total** | **5.128s** | **5.660s** | **8.780s** |

**Note:** Recoloring time includes background removal (rembg model loading ~1.5s)
plus HSV transformation (~0.2s). Background removal dominates, making recoloring
time nearly constant regardless of image size.

### Full Workflow (Measured)

Complete end-to-end workflow (yarn color extraction → background removal → garment recoloring):

| Image Size | Extraction | Bg Removal | Recolor | **Total** | Memory |
|------------|------------|------------|---------|-----------|--------|
| Small (300x300) | 2.87s | 1.63s | 0.01s | **4.51s** | 262 MB |
| Medium (800x800) | 2.63s | 1.56s | 0.01s | **4.20s** | 271 MB |
| Large (1920x1080) | 7.34s | 1.70s | 0.04s | **9.09s** | 293 MB |

**Bottleneck Analysis:**

| Size | Bottleneck | % of Total |
|------|------------|------------|
| Small | Color Extraction | 63.7% |
| Medium | Color Extraction | 62.5% |
| Large | Color Extraction | 80.8% |

**Key Findings:**
- **Color Extraction** is the clear bottleneck (K-means clustering scales with pixel count)
- **Background Removal** stays constant (~1.6s) due to fixed model inference time
- **Garment Recoloring** is negligible (<0.05s)

**Optimization Opportunities:**
1. **Cache extracted colors** - instant results for repeat yarn uploads
2. **Downscale images before K-means** - trade quality for speed
3. **Optimize K-means** - reduce iterations or use MiniBatchKMeans
4. **GPU acceleration** - faster background removal with CUDA

**See full benchmarks:** [benchmarks/](./benchmarks/)

## ⚠️ Known Limitations

- **Foreground Detection:** Currently recolors all detected foreground objects (may include person, not just garment)
- **Best Results:** Works optimally with solid-colored garments on simple backgrounds
- **Processing Time:** (see [Performance Benchmarks](#-performance-benchmarks) for details)
  - Color extraction: 3-7 seconds (K-means clustering, scales with image size)
  - Background removal + recoloring: ~1.8 seconds (rembg model dominates)
  - Total workflow: 5-9 seconds for tested sizes
- **Color Distribution:** Simple brightness-based mapping (future: more sophisticated algorithms)
- **File Size Limit:** 5MB maximum for API uploads
- **Mobile UI:** Not yet optimized for mobile devices (coming in Phase 4)

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
- ✅ CORS configuration

### ✅ Phase 3: Frontend Interface (Complete)

- ✅ React + TypeScript + Vite setup
- ✅ Image upload component with validation
- ✅ Real-time color extraction
- ✅ Visual color palette display
- ✅ Garment upload workflow
- ✅ Garment recoloring integration
- ✅ Before/after comparison view (side-by-side)
- ✅ Start Over reset functionality
- ✅ Consistent CSS styling

### 📅 Phase 4: Polish & Deployment (Complete)

- Drag-and-drop upload
- Mobile responsive design
- UI/UX improvements
- Backend deployment (Railway/Render)
- Frontend deployment (Vercel/Netlify)
- Performance optimizations (future)

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
- [React](https://react.dev/) - UI library
- [Vite](https://vitejs.dev/) - Next generation frontend tooling
- Inspiration from the knitting and maker community

## 📚 Documentation

For detailed technical decisions and architecture documentation, see:

- **[Architecture Overview](docs/ARCHITECTURE.md)** - System design, data flow, component interaction
- [ADR 001: Color Extraction Algorithm](docs/decisions/001-color-filtering-strategy.md) - K-means clustering selection
- [ADR 002: Background Removal](docs/decisions/002-background-removal.md) - rembg/U²-Net selection
- [ADR 003: API Design](docs/decisions/003-api-design.md) - FastAPI REST endpoints
- [ADR 004: Frontend Architecture](docs/decisions/004-react-frontend-architecture.md) - React + TypeScript decisions
- [ADR 005: Performance Optimization](docs/decisions/005-performance-optimization-strategy.md) - Bottleneck analysis and optimization strategies

---

Built with ❤️ for knitters and designers
_Last updated: February 5, 2026 - Added documentation links throughout README_