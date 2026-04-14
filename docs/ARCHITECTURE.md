# ChromaKnit Architecture

## System Overview

ChromaKnit is a full-stack application for visualizing yarn colors on garments. The system consists of three main layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend (TypeScript)                  │
│                     localhost:5173 / Vercel                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTP/REST
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                     │
│                     localhost:8000 / Railway                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Processing Engine (Python)                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ ColorExtractor  │  │ BackgroundRemover│  │ GarmentRecolorer│  │
│  │   (K-means)     │  │   (rembg/U²-Net) │  │ (HSV transform) │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Interaction

### User Workflow

```
User uploads yarn image
        │
        ▼
┌───────────────────┐
│  React Frontend   │ ──── POST /api/colors/extract ────┐
└───────────────────┘                                    │
        │                                                ▼
        │                                    ┌───────────────────┐
        │                                    │  FastAPI Backend  │
        │                                    └───────────────────┘
        │                                                │
        │                                                ▼
        │                                    ┌───────────────────┐
        │                                    │  ColorExtractor   │
        │                                    │  (K-means)        │
        │                                    └───────────────────┘
        │                                                │
        │◄───────── JSON: {colors: ["#142a68", ...]} ────┘
        │
        ▼
User sees color palette
        │
        ▼
User uploads garment image
        │
        ▼
┌───────────────────┐
│  React Frontend   │ ──── POST /api/garments/recolor ──┐
└───────────────────┘                                    │
        │                                                ▼
        │                                    ┌───────────────────┐
        │                                    │  FastAPI Backend  │
        │                                    └───────────────────┘
        │                                                │
        │                                    ┌───────────┴───────────┐
        │                                    ▼                       ▼
        │                         ┌─────────────────┐    ┌─────────────────┐
        │                         │ BackgroundRemover│    │ GarmentRecolorer│
        │                         │ (rembg)          │───▶│ (HSV transform) │
        │                         └─────────────────┘    └─────────────────┘
        │                                                        │
        │◄──────────────────── PNG image ────────────────────────┘
        │
        ▼
User sees original vs recolored comparison
```

---

## Technology Choices

Each technology choice is documented with rationale in Architecture Decision Records (ADRs):

| Component | Technology | Why | ADR |
|-----------|------------|-----|-----|
| Color Extraction | K-means (scikit-learn) | Industry standard, frequency-based sorting | [ADR 001](decisions/001-yarn-color-extraction.md) |
| Background Removal | rembg (U²-Net) | Automatic, high quality, simple API | [ADR 002](decisions/002-recoloring-strategy.md) |
| API Framework | FastAPI | Auto-docs, validation, async support | [ADR 003](decisions/003-api-design.md) |
| Frontend | React + TypeScript | Component reuse, type safety | [ADR 004](decisions/004-react-frontend-architecture.md) |
| Build Tool | Vite | Fast HMR, modern defaults | [ADR 004](decisions/004-react-frontend-architecture.md) |

---

## Data Flow

### 1. Color Extraction Pipeline

```
Yarn Image (JPG/PNG)
        │
        ▼
┌─────────────────────────────────────────┐
│  Load image with OpenCV                 │
│  Convert BGR → RGB                      │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  Reshape: (H, W, 3) → (H×W, 3)          │
│  Each row = one pixel's RGB values      │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  K-means Clustering                     │
│  n_clusters=n_colors (default 5)        │
│  n_init=10, random_state=42             │
│  Groups similar pixels into clusters    │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  Extract cluster centers (RGB)          │
│  Count pixels per cluster (frequency)   │
│  Sort by frequency (descending)         │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  Convert RGB → Hex codes                │
│  Output: ["#142a68", "#23438d", ...]    │
└─────────────────────────────────────────┘
```

### 2. Garment Recoloring Pipeline

```
Garment Image (JPG/PNG)
        │
        ▼
┌─────────────────────────────────────────┐
│  rembg Background Removal               │
│  U²-Net model inference (~1.7s)         │
│  Output: RGBA image with alpha mask     │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  Extract alpha channel as mask          │
│  255 = foreground, 0 = background       │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  Convert RGB → HSV color space          │
│  H = Hue (color)                        │
│  S = Saturation (intensity)             │
│  V = Value (brightness)                 │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  For each pixel where mask > 0:         │
│  - Replace H with yarn color hue        │
│  - Replace S with yarn color saturation │
│  - Remap V to yarn's brightness range   │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  Convert HSV → RGB                      │
│  Composite over transparent background  │
│  Output: Recolored PNG with alpha       │
└─────────────────────────────────────────┘
```

### 3. API Request/Response Flow

```
Frontend                          Backend                          Processing
   │                                 │                                 │
   │  POST /api/colors/extract       │                                 │
   │  body: FormData(file)           │                                 │
   │────────────────────────────────▶│                                 │
   │                                 │  Validate file type/size        │
   │                                 │  Save to temp file               │
   │                                 │─────────────────────────────────▶│
   │                                 │                                 │ ColorExtractor
   │                                 │                                 │ .extract_dominant_colors()
   │                                 │◀─────────────────────────────────│
   │                                 │  Delete temp file                │
   │  200 OK                         │                                 │
   │  {success, colors, count}       │                                 │
   │◀────────────────────────────────│                                 │
   │                                 │                                 │
   │  POST /api/garments/recolor     │                                 │
   │  body: FormData(file, colors)   │                                 │
   │────────────────────────────────▶│                                 │
   │                                 │  Validate file type/size        │
   │                                 │  Parse colors (JSON or CSV)     │
   │                                 │─────────────────────────────────▶│
   │                                 │                                 │ GarmentRecolorer
   │                                 │                                 │ .recolor_garment()
   │                                 │◀─────────────────────────────────│
   │  200 OK                         │                                 │
   │  image/png (binary)             │                                 │
   │◀────────────────────────────────│                                 │
```

---

## Directory Structure

```
chromaknit/
├── core/                           # Processing Engine
│   ├── yarn_color_extractor.py     # ColorExtractor class
│   ├── garment_recolor.py          # GarmentRecolorer class
│   └── utils.py                    # Shared utilities
│
├── api/                            # Backend API
│   └── main.py                     # FastAPI app, routes, CORS
│
├── chromaknit-frontend/            # Frontend
│   ├── src/
│   │   ├── App.tsx                 # Main component, state management
│   │   ├── App.css                 # All component styles (~900 lines)
│   │   ├── index.css               # Design system variables + keyframes
│   │   ├── config.ts               # API base URL configuration
│   │   ├── main.tsx                # Entry point
│   │   └── components/
│   │       ├── Header.tsx          # Frosted glass header with CTA
│   │       ├── PetalBackground.tsx # Fixed background + floating petals
│   │       ├── BuilderNotes.tsx    # Collapsible tech stack panel
│   │       ├── SampleStrip.tsx     # Tabbed workspace (pick yarn → garment → result)
│   │       ├── StepSection.tsx     # Reusable step wrapper
│   │       ├── InfoPanel.tsx       # Expandable info tooltips
│   │       ├── UploadZone.tsx      # Styled file upload with sample images
│   │       ├── ColorPalette.tsx    # Colour swatches + distribution bar
│   │       ├── LoadingCat.tsx      # Cat + yarn ball loading animation
│   │       ├── BeforeAfter.tsx     # Draggable comparison slider
│   │       └── ReportIssue.tsx     # Floating issue reporter → GitHub Issues
│   ├── package.json
│   └── vite.config.ts
│
├── tests/                          # Test Suite
│   ├── test_color_extractor.py
│   ├── test_garment_recolor.py
│   └── test_utils.py
│
├── benchmarks/                     # Performance Benchmarks
│   ├── benchmark_color_extractor.py
│   ├── benchmark_recolor_garment.py
│   └── benchmark_full_workflow.py
│
├── docs/                           # Documentation
│   ├── ARCHITECTURE.md             # This file
│   └── decisions/                  # Architecture Decision Records
│       ├── 001-yarn-color-extraction.md
│       ├── 002-recoloring-strategy.md
│       ├── 003-api-design.md
│       ├── 004-react-frontend-architecture.md
│       ├── 005-performance-optimization-strategy.md
│       └── 006-ui-redesign.md
│
├── examples/                       # Sample images
├── results/                        # Output directory
└── main.py                         # CLI demo script
```

---

## Performance Characteristics

| Stage | Time | Scaling | Bottleneck |
|-------|------|---------|------------|
| Color Extraction | 3-8s | O(n) with pixels | K-means iterations |
| Background Removal | ~1.7s | O(1) constant | Model inference |
| HSV Recoloring | <0.05s | O(n) optimized | None |

**Key insight:** Color extraction dominates (63-81% of total time). See [ADR 005](decisions/005-performance-optimization-strategy.md) for optimization strategies.

---

## Deployment Optimizations

### Lazy Loading for Memory Efficiency

The `rembg` library (with onnxruntime) requires ~300-400MB of memory. To reduce startup memory on memory-constrained hosts (e.g., Railway with 512MB):

```python
# Instead of top-level import:
# from rembg import remove  # Loads onnxruntime at module import

# Use lazy import inside the method:
def remove_background(self):
    from rembg import remove  # Only loads when actually called
    self.image_no_bg = remove(self.image)
```

**Benefits:**
- Server starts faster with lower memory footprint
- Health checks and color extraction work without loading rembg
- Memory-heavy model only loads when recoloring is requested

**Trade-off:** First recolor request has ~2-3s additional latency for model loading.

---

## Security Considerations

- **File uploads:** Validated by type (image/*) and size (5MB max)
- **Temp files:** Cleaned up after processing
- **No user data storage:** Stateless API, no database
- **CORS:** Configured for frontend origin only

---

## Related Documentation

- [ADR 001: Color Extraction](decisions/001-yarn-color-extraction.md)
- [ADR 002: Recoloring Strategy](decisions/002-recoloring-strategy.md)
- [ADR 003: API Design](decisions/003-api-design.md)
- [ADR 004: Frontend Architecture](decisions/004-react-frontend-architecture.md)
- [ADR 005: Performance Optimization](decisions/005-performance-optimization-strategy.md)
- [ADR 006: UI Redesign](decisions/006-ui-redesign.md)

---

**Last Updated:** April 12, 2026
