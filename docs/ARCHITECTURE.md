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
│                     localhost:8000 / Render                      │
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
| Color Extraction | K-means (scikit-learn) | Industry standard, frequency-based sorting | [ADR 001](decisions/001-color-filtering-strategy.md) |
| Background Removal | rembg (U²-Net) | Automatic, high quality, simple API | [ADR 002](decisions/002-background-removal.md) |
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
│  - Keep V unchanged (preserves texture) │
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
│   │   ├── ImageUpload.tsx         # Reusable upload component
│   │   ├── App.css                 # Styles
│   │   └── main.tsx                # Entry point
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
│       ├── 001-color-filtering-strategy.md
│       ├── 002-background-removal.md
│       ├── 003-api-design.md
│       ├── 004-react-frontend-architecture.md
│       └── 005-performance-optimization-strategy.md
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

## Security Considerations

- **File uploads:** Validated by type (image/*) and size (5MB max)
- **Temp files:** Cleaned up after processing
- **No user data storage:** Stateless API, no database
- **CORS:** Configured for frontend origin only

---

## Related Documentation

- [ADR 001: Color Extraction](decisions/001-color-filtering-strategy.md)
- [ADR 002: Background Removal](decisions/002-background-removal.md)
- [ADR 003: API Design](decisions/003-api-design.md)
- [ADR 004: Frontend Architecture](decisions/004-react-frontend-architecture.md)
- [ADR 005: Performance Optimization](decisions/005-performance-optimization-strategy.md)

---

**Last Updated:** February 5, 2026
