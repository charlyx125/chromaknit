# ChromaKnit Frontend

A React application that lets you preview yarn colors on garments before buying. Upload a yarn photo to extract its colors, then apply those colors to a garment image.

## Demo

![ChromaKnit E2E demo](../examples/E2E-demo.gif)

## Features

- **Yarn Color Extraction**: Upload a yarn image and automatically extract the dominant colors
- **Garment Recoloring**: Apply extracted yarn colors to a garment photo
- **Side-by-Side Comparison**: View original and recolored garments together
- **Start Over**: Reset the app to try different yarn/garment combinations

## Tech Stack

- React 18 + TypeScript
- Vite (build tool)
- CSS (no framework)

## Project Structure

```
src/
├── App.tsx           # Main application component
├── App.css           # Application styles
├── ImageUpload.tsx   # Reusable image upload component
├── main.tsx          # Entry point
└── index.css         # Global styles
```

## Components

### App.tsx
Main component that handles:
- State management for yarn/garment images and extracted colors
- API calls to backend for color extraction and recoloring
- Two-step workflow UI (upload yarn → upload garment)

### ImageUpload.tsx
Reusable component with:
- File input with validation (5MB max, images only)
- Optional image preview
- Disabled state after upload
- Callback with file and preview URL

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

1. **Step 1**: Upload yarn photo
   - Colors are automatically extracted
   - Yarn image and color palette displayed side-by-side

2. **Step 2**: Upload garment photo
   - Click "Recolor Garment" to apply yarn colors
   - Original and recolored images shown side-by-side

3. **Start Over**: Reset to upload new images
