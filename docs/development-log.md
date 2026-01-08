# ChromaKnit Development Log

A detailed record of the development journey, decisions, and learnings for the ChromaKnit project.

---

## Project Timeline

- **Start Date:** December 2024
- **Current Phase:** Phase 3 - React Frontend Development
- **Status:** In Progress

---

## Phase 1: Core Algorithm Development (December 2024)

### Week 1: Research & Design

**December 9-15, 2024**

**Goals:**
- Research color extraction algorithms
- Design garment recoloring approach
- Set up project structure

**What I Built:**
- Initial project structure with modular design
- Research documentation on K-means clustering
- Color space analysis (RGB vs HSV vs LAB)

**Key Decisions:**
- ✅ Chose K-means clustering for color extraction (simple, effective, fast)
- ✅ Decided on HSV color space for recoloring (preserves brightness/texture)
- ✅ Selected rembg for background removal (state-of-the-art, easy to use)

**Challenges:**
- Understanding different color spaces and their trade-offs
- Figuring out how to preserve garment texture during recoloring

**Learnings:**
- K-means is perfect for dominant color extraction
- HSV color space separates color from brightness (key for texture preservation!)
- Background removal is crucial for clean results

---

### Week 2: Color Extraction Implementation

**December 16-22, 2024**

**Goals:**
- Implement K-means color extraction
- Add color visualization
- Create test suite

**What I Built:**
- `YarnColorExtractor` class with K-means clustering
- Color sorting by frequency
- Hex code conversion
- Visual palette generation with matplotlib
- Comprehensive test suite (23 tests, 99% coverage)

**Technical Highlights:**
```python
# K-means clustering in RGB space
kmeans = KMeans(n_clusters=n_colors, random_state=42)
labels = kmeans.fit_predict(pixels)

# Sort colors by frequency
unique, counts = np.unique(labels, return_counts=True)
sorted_colors = [centers[i] for i in sorted_indices]
```

**Challenges:**
- Getting consistent results (solved with `random_state=42`)
- Converting RGB to hex codes correctly
- Handling edge cases (single-color images, very small images)

**Learnings:**
- Always set random seed for reproducibility in ML algorithms
- Testing edge cases is crucial (empty arrays, single colors, etc.)
- NumPy array manipulation is powerful but requires careful dimension handling

**Test Results:**
- ✅ 23 tests passing
- ✅ 99% code coverage
- ✅ All edge cases handled

---

### Week 3: Garment Recoloring Implementation

**December 23-29, 2024**

**Goals:**
- Implement garment recoloring algorithm
- Integrate background removal
- Test on real garment images

**What I Built:**
- `GarmentRecolorer` class
- HSV color space transformation
- Multi-color distribution based on brightness
- Background removal integration
- 15 comprehensive tests (89% coverage)

**Technical Highlights:**
```python
# Convert to HSV and modify hue/saturation while preserving value (brightness)
hsv_image = cv2.cvtColor(image, cv2.COLOR_RGB2HSV).astype(np.float32)
hsv_image[:, :, 0] = new_hue      # Change color
hsv_image[:, :, 1] = new_sat      # Change saturation
# Keep hsv_image[:, :, 2] unchanged - preserves texture!
```

**Challenges:**
- Understanding HSV color space and its ranges (H: 0-179, S/V: 0-255)
- Background removal sometimes included people in foreground
- Multi-color distribution needed tuning

**Learnings:**
- **HSV is magic for recoloring** - changing H and S while keeping V preserves all texture and lighting
- Background removal isn't perfect but works well for most cases
- Simple brightness-based color distribution works surprisingly well

**Results:**
- ✅ Realistic recoloring with texture preservation
- ✅ Shadows and folds maintained
- ✅ 89% test coverage
- ⚠️ Known limitation: May recolor person if detected in foreground

---

### Week 4: Performance & Polish

**December 30, 2024 - January 5, 2025**

**Goals:**
- Add performance benchmarks
- Set up CI/CD
- Write documentation

**What I Built:**
- Performance benchmarking suite
- GitHub Actions CI/CD pipeline
- Comprehensive README
- Architecture Decision Records (ADRs)
- Demo script (`main.py`)

**Benchmarks:**
```
Image Size    Pixels        Processing Time
Small         90,000        0.234s
Medium        640,000       1.456s
Large         2,073,600     3.892s
```

**CI/CD Pipeline:**
- ✅ Automated testing on every push
- ✅ Code coverage reporting
- ✅ Python 3.11 testing

**Documentation:**
- Detailed README with examples
- ADR 001: K-means color extraction
- ADR 002: Background removal strategy

**Phase 1 Results:**
- ✅ Fully functional color extraction and recoloring
- ✅ 38+ tests with high coverage
- ✅ Production-ready code quality
- ✅ Complete documentation

---

## Phase 2: REST API Development (January 2025)

### Week 5: FastAPI Backend

**January 6-7, 2025**

**Goals:**
- Wrap core functionality in REST API
- Add proper error handling
- Generate API documentation

**What I Built:**
- FastAPI application with 4 endpoints
- File upload handling with validation
- Flexible input parsing (JSON arrays + CSV strings)
- Automatic Swagger UI documentation
- CORS middleware for frontend integration

**Endpoints:**
```python
GET  /                          # Health check
POST /api/colors/extract        # Extract colors from yarn
POST /api/garments/recolor      # Recolor garment with colors
GET  /docs                      # Interactive API docs
```

**Technical Highlights:**
```python
# Flexible color input parsing
if isinstance(colors, str):
    # Support comma-separated: "#abc,#def"
    colors = [c.strip() for c in colors.split(',')]

# Proper error handling with HTTP codes
if file.size > 5_000_000:
    raise HTTPException(status_code=413, detail="File too large")
```

**API Design Decisions:**
- ✅ Used FastAPI for speed + auto-docs
- ✅ Supported multiple input formats (better DX)
- ✅ Implemented three-layer validation (type → size → processing)
- ✅ Used proper HTTP status codes (200, 400, 413, 500)
- ✅ Added CORS for frontend communication

**Challenges:**
- Handling file uploads in memory vs streaming
- Parsing different color input formats
- Managing temporary files cleanup
- Deciding between FileResponse vs StreamingResponse

**Learnings:**
- FastAPI's auto-documentation is AMAZING for API development
- Small architectural decisions (like dual input formats) have outsized impact on DX
- Proper HTTP semantics matter - each status code tells a story
- File size validation should happen at multiple layers

**Performance:**
- Color extraction: <1 second
- Garment recoloring: <15 seconds (mostly background removal)

**Phase 2 Results:**
- ✅ Production-ready REST API
- ✅ Interactive documentation at `/docs`
- ✅ Comprehensive error handling
- ✅ Ready for frontend integration

---

## Phase 3: React Frontend Development (January 2025)

### Week 6: React Setup & Image Upload

**January 8, 2025**

**Goals:**
- Set up React development environment
- Create image upload component
- Integrate with FastAPI backend

**What I Built:**
- React 18 + TypeScript + Vite project
- Reusable `ImageUpload` component
  - File validation (size, type)
  - Image preview with FileReader API
  - TypeScript props interface
  - Click-to-browse functionality
- Main `App` component with state management
- Real-time API integration using `fetch()`
- Visual color palette display

**Technical Highlights:**
```typescript
// State management with TypeScript
const [yarnImage, setYarnImage] = useState<File | null>(null)
const [extractedColors, setExtractedColors] = useState<string[]>([])
const [isExtractingColors, setIsExtractingColors] = useState<boolean>(false)

// Automatic API call when image uploaded
useEffect(() => {
  if (!yarnImage) return
  
  const extractColors = async () => {
    setIsExtractingColors(true)
    const formData = new FormData()
    formData.append('file', yarnImage)
    
    const response = await fetch('http://localhost:8000/api/colors/extract', {
      method: 'POST',
      body: formData
    })
    
    const data = await response.json()
    setExtractedColors(data.colors)
    setIsExtractingColors(false)
  }
  
  extractColors()
}, [yarnImage])
```

**Component Architecture:**
```
App.tsx (parent)
  ├─ ImageUpload component (reusable)
  │   ├─ File input
  │   ├─ Preview display
  │   └─ Validation logic
  └─ Color palette display
```

**Key React Concepts Learned:**
- **Components:** Reusable UI pieces (like functions for UI)
- **Props:** Pass data from parent to child (like function parameters)
- **State (useState):** Data that changes and triggers re-renders
- **Effects (useEffect):** Run code when state changes (like watchers)
- **JSX:** HTML-like syntax in JavaScript (requires `{ }` for JS expressions)
- **Conditional Rendering:** `{condition && <element>}` pattern
- **Array Mapping:** `array.map()` to create multiple elements

**Challenges:**
- Understanding React's declarative paradigm (describe what, not how)
- Learning when to use state vs regular variables
- Debugging CORS issues (fixed with middleware in FastAPI)
- Converting File objects to preview URLs (FileReader API)
- Understanding TypeScript generics in useState
- Differentiating browser features from React features

**Key Debugging Moment:**
- API returned data but colors weren't displaying
- Issue: Missing CSS for color boxes (they existed but were invisible)
- Lesson: Always check browser DevTools Console and Network tabs!

**Learnings:**
- React is about describing UI based on state, not manipulating DOM
- TypeScript makes React development much easier (autocomplete, type safety)
- `useState` triggers re-renders; regular variables don't
- `useEffect` with dependency array is powerful for side effects
- CORS must be configured for frontend-backend communication
- Browser console is essential for debugging React apps
- Components are like custom HTML elements you create

**Development Workflow:**
```bash
# Terminal 1: Backend
uvicorn api.main:app --reload

# Terminal 2: Frontend  
npm run dev

# Browser: localhost:5173
```

**Phase 3A Results:**
- ✅ Working React development environment
- ✅ Reusable image upload component
- ✅ Real-time color extraction with API integration
- ✅ Visual feedback (loading states, error handling)
- ✅ TypeScript type safety throughout
- 🔜 Garment upload and recoloring (tomorrow!)

**What's Next (Phase 3B):**
- Reuse ImageUpload component for garment upload
- Add "Recolor Garment" button
- Call `/api/garments/recolor` endpoint
- Display recolored image result
- Complete end-to-end user workflow

---

## Technical Stack Evolution

### Phase 1 (Core)
- Python 3.11
- OpenCV
- NumPy
- scikit-learn
- rembg

### Phase 2 (API)
- FastAPI
- Uvicorn
- Pydantic

### Phase 3 (Frontend)
- React 18
- TypeScript
- Vite
- Fetch API

---

## Key Metrics

**Code Quality:**
- Test Coverage: 89-99%
- Total Tests: 38+
- CI/CD: Automated

**Performance:**
- Color Extraction: ~1 second
- Garment Recoloring: ~15 seconds
- API Response Time: <1 second (excluding processing)

**Project Stats:**
- Lines of Code: ~2,000+
- Components: 2 (ImageUpload, App)
- API Endpoints: 4
- Documentation: Comprehensive README + ADRs

---

## Lessons Learned

### Technical Lessons

1. **K-means is perfect for color extraction** - Simple, fast, effective
2. **HSV color space is magic for recoloring** - Preserves texture by keeping V channel
3. **Background removal is 80% of recoloring quality** - Worth the processing time
4. **FastAPI's auto-docs are a game-changer** - Saves hours of documentation work
5. **Small API design decisions matter** - Dual input formats significantly improve DX
6. **React's declarative style is different but powerful** - Describe what, not how
7. **TypeScript makes React development easier** - Catch errors at compile time
8. **State management is the heart of React** - Understanding useState is crucial
9. **Browser DevTools are essential** - Console, Network tab, Elements tab

### Process Lessons

1. **Write tests first** - Caught bugs early, gave confidence to refactor
2. **ADRs document "why"** - Future me will thank present me
3. **Small commits** - Easier to review and revert if needed
4. **Benchmarks matter** - Know your performance characteristics
5. **Documentation while building** - Easier than documenting after
6. **Build in public** - Posting progress creates accountability and momentum
7. **Learn by building** - Projects > tutorials for real understanding
8. **Ask "why" not just "how"** - Understanding concepts > copying code
9. **Debug systematically** - Console logs, Network tab, step-by-step
10. **Celebrate small wins** - Each working feature is progress!

### Personal Growth
- **TypeScript proficiency:** Comfortable with types, interfaces, generics
- **API design skills:** Understand REST principles and HTTP semantics
- **Problem-solving:** Systematic debugging and troubleshooting
- **Documentation:** Writing clear, helpful docs for future reference

---

## Next Steps

### Immediate (Phase 3B - Tomorrow)
- [ ] Add garment upload component
- [ ] Integrate recoloring API call
- [ ] Display before/after comparison
- [ ] Complete end-to-end workflow

### Short-term (Phase 4)
- [ ] UI/UX polish (drag-and-drop, animations)
- [ ] Responsive mobile design
- [ ] Error message styling
- [ ] Loading spinners

### Medium-term (Phase 5)
- [ ] Deploy backend (Railway/Render)
- [ ] Deploy frontend (Vercel/Netlify)
- [ ] Production optimizations
- [ ] Analytics/monitoring

### Long-term (Phase 6+)
- [ ] User accounts
- [ ] Save/share recolored garments
- [ ] Color adjustment controls
- [ ] Multiple yarn support
- [ ] Mobile app (React Native?)

---

## Questions & Future Research

- How to improve foreground detection (isolate garment from person)?
- Better color distribution algorithm (beyond brightness-based)?
- Real-time preview (WebSocket streaming)?
- Batch processing support?
- Mobile-optimized UI patterns?
- State management at scale (Redux/Zustand)?

---

## Resources Used

**Documentation:**
- FastAPI: https://fastapi.tiangolo.com/
- React: https://react.dev/
- TypeScript: https://www.typescriptlang.org/
- OpenCV: https://docs.opencv.org/

**Libraries:**
- rembg: https://github.com/danielgatis/rembg
- scikit-learn: https://scikit-learn.org/
- Vite: https://vitejs.dev/

**Learning:**
- React hooks deep dive
- TypeScript with React patterns
- REST API best practices
- CORS configuration guide

---

**Last Updated:** January 8, 2025  
**Current Status:** Phase 3A Complete - Color extraction working end-to-end!  
**Next Session:** Phase 3B - Garment recoloring integration