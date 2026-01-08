# ADR 004: React Frontend Architecture Decisions

**Date:** January 2026  
**Status:** Accepted  
**Author:** Joyce Chong  
**Phase:** Phase 4 - React Frontend Development

---

## Context

After completing the FastAPI backend (Phase 3), ChromaKnit needed a user-friendly web interface. The goal was to create an interactive application where knitters could:

1. Upload yarn photos and see extracted colors
2. Upload garment photos and preview recolored results
3. Complete the workflow without touching code or command lines

**My starting point:**

- ✅ Professional experience: TypeScript (Playwright tests at Adserve)
- ✅ Basic JavaScript knowledge
- ❌ Zero React experience
- ❌ Never built a frontend application

**Requirements:**

- Fast development workflow with hot reload
- Type safety to catch errors early
- Modern, maintainable architecture
- Easy integration with existing FastAPI backend
- Gentle learning curve for a React beginner

---

## Decision

### 1. React Framework Selection: **Vite + React + TypeScript**

**Selected Stack:**

- **Build Tool:** Vite 6.x
- **UI Library:** React 18
- **Type System:** TypeScript 5.x
- **Styling:** Plain CSS3

**Not Selected:**

- Create React App (deprecated, slow)
- Next.js (too complex for this use case)
- Vanilla JavaScript (no type safety)
- Vue/Svelte/Angular (less ecosystem support)

---

### 2. Project Structure: **Component-Based Architecture**

```
chromaknit-frontend/
├── src/
│   ├── App.tsx              # Main application component
│   ├── ImageUpload.tsx      # Reusable upload component
│   ├── App.css              # Component styles
│   ├── main.tsx             # React entry point
│   └── index.css            # Global styles
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite config
└── index.html               # HTML shell
```

**Design principles:**

- **Single Responsibility:** Each component has one clear purpose
- **Reusability:** `ImageUpload` used for both yarn and garment uploads
- **Colocation:** Styles live near components
- **Simplicity:** Flat structure (no premature abstraction)

---

### 3. State Management: **React Hooks (useState, useEffect)**

**Selected Approach:**

```typescript
// Simple, built-in state management
const [yarnImage, setYarnImage] = useState<File | null>(null);
const [extractedColors, setExtractedColors] = useState<string[]>([]);
const [isExtractingColors, setIsExtractingColors] = useState<boolean>(false);
```

**Not Selected:**

- Redux (overkill for this app size)
- Zustand (unnecessary complexity)
- Context API (no prop drilling problem yet)
- MobX (additional learning curve)

**Rationale:**

- Built-in React hooks sufficient for current scope
- Easy to understand for React beginners
- Can refactor to Redux/Zustand later if needed
- Follows React's recommended approach

---

### 4. API Integration: **Fetch API with Async/Await**

**Selected Approach:**

```typescript
useEffect(() => {
  if (!yarnImage) return;

  const extractColors = async () => {
    setIsExtractingColors(true);

    try {
      const formData = new FormData();
      formData.append("file", yarnImage);

      const response = await fetch("http://localhost:8000/api/colors/extract", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setExtractedColors(data.colors);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsExtractingColors(false);
    }
  };

  extractColors();
}, [yarnImage]);
```

**Not Selected:**

- Axios (extra dependency, fetch is built-in)
- React Query (overkill for simple API calls)
- SWR (no caching/revalidation needed yet)

**Rationale:**

- Native `fetch()` API is sufficient
- Works well with async/await syntax
- No additional dependencies
- Easy to upgrade to Axios/React Query later if needed

---

### 5. Type Safety Strategy: **Explicit TypeScript Types**

**Selected Approach:**

```typescript
// Explicit types for all state
const [yarnImage, setYarnImage] = useState<File | null>(null);
const [extractedColors, setExtractedColors] = useState<string[]>([]);
const [isExtractingColors, setIsExtractingColors] = useState<boolean>(false);
const [error, setError] = useState<string | null>(null);

// Props interfaces for components
interface ImageUploadProps {
  label: string;
  onImageSelect: (file: File) => void;
}
```

**Key principles:**

- Always specify generic types in `useState<Type>`
- Use union types for nullable values (`File | null`)
- Define interfaces for component props
- Leverage TypeScript for compile-time error detection

**Benefits observed:**

- Caught bugs before running code
- Excellent autocomplete in VS Code
- Clear data flow documentation
- Easier refactoring

---

### 6. File Upload Strategy: **Browser Native Input + FileReader**

**Selected Approach:**

```typescript
// Use native browser file input
<input type="file" accept="image/*" onChange={handleFileChange} />;

// Preview with FileReader API
const reader = new FileReader();
reader.onload = (e) => {
  setPreviewUrl(e.target?.result as string);
};
reader.readAsDataURL(file);
```

**Not Selected:**

- React Dropzone (nice-to-have, can add later)
- Custom drag-and-drop (premature optimization)

**Rationale:**

- Native browser APIs are reliable
- Zero dependencies for Phase 4A
- Easy to enhance with drag-and-drop later
- FileReader provides image preview functionality

---

### 7. Styling Approach: **Plain CSS with BEM-like Classes**

**Selected Approach:**

```css
/* Component-specific classes */
.color-palette {
  display: flex;
  gap: 10px;
}

.color-box {
  width: 60px;
  height: 60px;
  border-radius: 8px;
}

.color-box:hover {
  transform: scale(1.1);
}
```

**Not Selected:**

- CSS-in-JS (styled-components, Emotion)
- Tailwind CSS (learning curve + setup)
- CSS Modules (overkill for small app)
- Sass/Less (unnecessary compilation)

**Rationale:**

- Keep it simple for learning phase
- Plain CSS is familiar and fast
- Easy to migrate to Tailwind later if desired
- No additional build step or dependencies

---

### 8. Error Handling Strategy: **Three-Layer Validation**

**Layer 1: Client-Side Validation (Immediate Feedback)**

```typescript
// File size check
if (file.size > 5 * 1024 * 1024) {
  alert("File must be less than 5MB");
  return;
}

// File type check
if (!file.type.startsWith("image/")) {
  alert("File must be an image");
  return;
}
```

**Layer 2: API Response Handling**

```typescript
if (!response.ok) {
  throw new Error(`API error: ${response.status}`);
}
```

**Layer 3: UI Error Display**

```typescript
{
  error && <div className="error">❌ Error: {error}</div>;
}
```

**Benefits:**

- Fast feedback (client-side catches obvious issues)
- Network errors handled gracefully
- User-friendly error messages
- Consistent with backend validation (defense in depth)

---

### 9. Component Communication Pattern: **Props Down, Events Up**

**Selected Approach:**

```typescript
// Parent (App.tsx)
function App() {
  const [yarnImage, setYarnImage] = useState<File | null>(null);

  return (
    <ImageUpload
      label="Upload yarn" // ← Data flows DOWN via props
      onImageSelect={setYarnImage} // ← Events flow UP via callbacks
    />
  );
}

// Child (ImageUpload.tsx)
function ImageUpload({ label, onImageSelect }: ImageUploadProps) {
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelect(file); // ← Call parent's function
    }
  };
}
```

**Pattern:** Unidirectional data flow

- Parent owns the state
- Child receives data via props
- Child communicates back via callback props

**Benefits:**

- Clear data flow (easy to debug)
- Single source of truth (no state duplication)
- Standard React pattern (well-documented)

---

### 10. Development Workflow: **Dual-Server Setup**

**Selected Approach:**

```bash
# Terminal 1 - Backend
uvicorn api.main:app --reload
# → http://localhost:8000

# Terminal 2 - Frontend
npm run dev
# → http://localhost:5173
```

**Key Configuration:**

- FastAPI with CORS middleware enabled
- Vite dev server with hot module replacement (HMR)
- Both servers run simultaneously during development

**Benefits:**

- Hot reload on both frontend and backend
- Full-stack debugging in real-time
- Immediate visual feedback
- Mirrors production architecture (separate frontend/backend)

---

## Consequences

### Positive

**Development Speed:**

- ✅ Vite's HMR provides instant feedback (<300ms reload)
- ✅ TypeScript catches errors during development
- ✅ Simple architecture = fast iteration

**Code Quality:**

- ✅ Type safety prevents runtime errors
- ✅ Reusable components (ImageUpload used 2x)
- ✅ Clear separation of concerns

**Learning Experience:**

- ✅ Gentle introduction to React concepts
- ✅ TypeScript experience from Playwright transferred well
- ✅ Built confidence to continue with React

**Integration:**

- ✅ Seamless connection to FastAPI backend
- ✅ CORS configuration documented and understood
- ✅ Error handling consistent across stack

### Negative

**Technical Debt:**

- ⚠️ No drag-and-drop (nice-to-have for Phase 4B)
- ⚠️ No optimistic UI updates
- ⚠️ Browser storage NOT used (localStorage disabled in artifacts, in-memory only)
- ⚠️ Plain CSS may become unwieldy as app grows

**Performance:**

- ⚠️ No code splitting yet (acceptable for current size)
- ⚠️ No image optimization (will need for production)
- ⚠️ Synchronous API calls (could benefit from React Query caching)

**User Experience:**

- ⚠️ No mobile optimization yet
- ⚠️ Basic loading indicators (could be more polished)
- ⚠️ Limited error recovery options

---

## Alternatives Considered

### Alternative 1: Create React App (CRA)

**Why Not:**

- Officially deprecated by React team
- Slow development server (3-5 seconds for hot reload)
- Heavy webpack configuration
- Poor developer experience compared to Vite

### Alternative 2: Next.js

**Why Not:**

- Server-side rendering not needed (client-side only app)
- File-based routing overkill for single-page app
- Additional complexity for React beginner
- Could revisit for Phase 5 if SEO becomes important

### Alternative 3: Vue.js or Svelte

**Why Not:**

- Smaller ecosystem than React
- Fewer job opportunities (less transferable skill)
- React's learning resources more comprehensive
- Personal goal was to learn React specifically

### Alternative 4: Tailwind CSS

**Why Not:**

- Additional setup complexity
- Learning curve on top of React learning curve
- Can add later without major refactoring
- Plain CSS sufficient for MVP

### Alternative 5: Redux for State Management

**Why Not:**

- Massive overkill for 7 state variables
- Steep learning curve
- Additional boilerplate
- React hooks (useState/useEffect) sufficient for current needs

---

## Implementation Details

### Critical Browser Storage Restriction

**IMPORTANT:** `localStorage` and `sessionStorage` are NOT supported in Claude.ai artifact environment.

**Impact on ChromaKnit:**

- ✅ All state stored in memory (React state) during session
- ✅ No persistence needed for Phase 4A MVP
- ⚠️ User loses data on page refresh (acceptable for MVP)
- 🔜 Phase 5 will implement proper backend storage if persistence needed

**Decision:** Use in-memory state only (React useState) for Phase 4. If persistence becomes critical, implement backend storage, not browser storage.

---

### Key Technical Patterns

**Pattern 1: Automatic API Calls with useEffect**

```typescript
useEffect(() => {
  if (!yarnImage) return; // Guard clause

  const extractColors = async () => {
    // API call logic
  };

  extractColors();
}, [yarnImage]); // Dependency array - run when yarnImage changes
```

**Pattern 2: Conditional Rendering**

```typescript
// Show loading indicator
{
  isExtractingColors && <p>⏳ Extracting colors...</p>;
}

// Show results when available
{
  extractedColors.length > 0 && (
    <div>
      {extractedColors.map((color, index) => (
        <div key={index} style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}
```

**Pattern 3: Error Boundaries**

```typescript
try {
  // API call
} catch (err) {
  setError(err instanceof Error ? err.message : "Unknown error");
} finally {
  setIsLoading(false); // Always runs
}
```

---

## Lessons Learned

### What Worked Well

1. **TypeScript from Day 1** - Caught bugs immediately, excellent DX
2. **Small, focused components** - Easy to understand and test
3. **Browser DevTools** - Console, Network, Elements tabs essential for debugging
4. **Incremental learning** - Built working feature, then understood concepts
5. **CORS configuration early** - Avoided late-stage integration issues

### What Was Challenging

1. **Declarative mindset shift** - "Describe what, not how" took time to internalize
2. **State vs props confusion** - When to use which?
3. **Async state updates** - Understanding React's re-render cycle
4. **CSS debugging** - "Element exists but invisible" was confusing
5. **Two-server workflow** - Initially unclear why both servers needed

### Key Debugging Moments

**Issue 1: "Failed to fetch"**

- **Symptom:** API calls failing silently
- **Root cause:** CORS policy blocking cross-origin requests
- **Solution:** Add CORS middleware to FastAPI
- **Tool:** Browser Network tab revealed the real error

**Issue 2: "Colors not displaying"**

- **Symptom:** API returns data, but UI doesn't update
- **Root cause:** Setting entire response object instead of `data.colors` array
- **Solution:** Console.log to inspect actual response structure
- **Tool:** Browser Console with strategic logging

**Issue 3: "Color boxes invisible"**

- **Symptom:** Elements in DOM but not visible
- **Root cause:** Missing CSS width/height properties
- **Solution:** Inspect element to see 0x0 dimensions
- **Tool:** Browser Elements tab

---

## Future Considerations

### Phase 4B (Next Session)

- Add garment recoloring workflow
- Reuse ImageUpload component for garment upload
- Display recolored image results
- Before/after comparison view

### Phase 5 (Production)

- Add drag-and-drop file upload
- Implement loading animations
- Mobile responsive design
- Deploy to Vercel (frontend) + Railway/Render (backend)
- Production CORS configuration (whitelist production domains)

### Phase 6 (Enhancements)

- Consider React Query for better API state management
- Migrate to Tailwind CSS for faster styling
- Add image compression before upload
- Implement optimistic UI updates
- Consider Next.js for SEO if needed

### Potential Refactors

- **State management:** If app grows beyond 15+ state variables, consider Zustand
- **Styling:** If CSS becomes unwieldy (>500 lines), migrate to Tailwind
- **Type safety:** Create shared types package for frontend + backend
- **Testing:** Add React Testing Library + Vitest

---

## References

### Documentation

- [React Documentation](https://react.dev/) - Official React docs
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - TypeScript reference
- [Vite Guide](https://vitejs.dev/guide/) - Vite documentation
- [MDN: FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader) - File upload reference

### Learning Resources

- React hooks deep dive (useState, useEffect patterns)
- TypeScript with React best practices
- CORS configuration guide
- Browser DevTools debugging techniques

### Related ADRs

- [ADR 001: Color Extraction Algorithm](001-color-extraction-algorithm.md)
- [ADR 002: Background Removal Strategy](002-background-removal-strategy.md)
- [ADR 003: API Design Decisions](003-api-design.md)

---

**Status:** Accepted and Implemented  
**Review Date:** After Phase 4B completion  
**Last Updated:** January 2026
