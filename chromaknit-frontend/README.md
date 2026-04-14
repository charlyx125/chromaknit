# ChromaKnit Frontend

A React application that lets you preview yarn colors on garments before buying. Pick a yarn swatch (or upload your own), extract its colors, then apply those colors to a garment image.

## Demo

![ChromaKnit E2E demo](../examples/E2E-demo.gif)

## Features

- **Yarn Sample Cards**: Fanned card layout with hover/select animations — pick a preset or upload your own
- **Yarn Color Extraction**: Automatically extract dominant colors via the backend API
- **Garment Recoloring**: Apply extracted yarn colors to a garment photo with sample garment options
- **Before/After Comparison**: Draggable slider to compare original and recoloured garments
- **Report Issue**: Floating button that opens a pre-filled GitHub Issue with categorised templates
- **Start Over**: Reset the app to try different yarn/garment combinations

## Tech Stack

- React 19 + TypeScript
- Vite (build tool)
- CSS3 (custom design system — no framework)

## Project Structure

```
src/
├── App.tsx              # Main application (state + API logic)
├── App.css              # All component styles (~900 lines)
├── index.css            # Design system variables + keyframes
├── config.ts            # API base URL configuration
├── ImageUpload.tsx      # Legacy upload component (unused)
├── main.tsx             # React entry point
└── components/
    ├── Header.tsx       # Frosted glass header with CTA
    ├── PetalBackground.tsx  # Fixed background + floating petals
    ├── BuilderNotes.tsx # Collapsible tech stack panel
    ├── SampleStrip.tsx  # Tabbed workspace (pick yarn → upload garment → result)
    ├── StepSection.tsx  # Reusable step wrapper
    ├── InfoPanel.tsx    # Expandable info tooltips
    ├── UploadZone.tsx   # Styled file upload with sample images
    ├── ColorPalette.tsx # Colour swatches + distribution bar
    ├── LoadingCat.tsx   # Cat + yarn ball loading animation
    ├── BeforeAfter.tsx  # Draggable comparison slider
    └── ReportIssue.tsx  # Floating issue reporter → GitHub Issues
```

## Components

### App.tsx
Main component that manages:
- All application state (yarn, garment, colors, tabs, errors)
- API calls with AbortController for cancellation
- Image resizing before upload (yarn: 400px, garment: 500px)
- Tabbed workflow coordination

### SampleStrip.tsx
Tabbed workspace with three tabs:
- **Pick yarn** — fanned sample cards + "upload your own" card
- **Upload garment** — drag zone with sample garments, extracted color swatches, recolour button
- **Result** — before/after slider with download

### ReportIssue.tsx
Floating button (bottom-right corner) that opens a modal with issue categories:
- Recolouring looks wrong
- Image upload failed
- Slow / unresponsive app
- Other (free text)

Submits as a pre-filled GitHub Issue on the project repo.

## Getting Started

### Prerequisites
- Node.js 18+
- Backend server running on `http://localhost:8000`

### Installation

```bash
cd chromaknit-frontend
npm install
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:5173`

### Build

```bash
npm run build
```

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/colors/extract` | POST | Extract colors from yarn image |
| `/api/garments/recolor` | POST | Recolor garment with extracted colors |

## User Flow

1. **Tab 1 — Pick yarn**: Click a sample swatch or "+" to upload your own yarn photo. Colors are extracted automatically.
2. **Tab 2 — Upload garment**: Upload a garment photo or pick a sample. Click "recolour garment" to apply yarn colors.
3. **Tab 3 — Result**: Drag the slider to compare original vs recoloured. Download or start over.
