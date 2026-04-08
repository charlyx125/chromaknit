# ADR 006: UI Redesign — Frosted Glass Header and Step-Based Workflow

**Date:** April 2026
**Status:** Accepted and Implemented
**Author:** Joyce Chong
**Phase:** Phase 3 - React Frontend (UI Redesign)

---

## Context

The initial React frontend (ADR 004) was functional but visually generic. It used the default Vite dark theme, system fonts, and a flat layout with no visual identity. The goal of the redesign was to give ChromaKnit a distinctive, polished look that matched the craft/textile audience while keeping all existing API logic intact.

### The Problem

- Default React/Vite styling looked like every other starter project
- No brand identity, no design system, no typography hierarchy
- The two-step workflow (upload yarn, upload garment) was presented as a plain form with no visual flow
- No visual feedback during loading states beyond text
- No way to compare before/after results side by side

### Design Inspiration

The whole project started because I love the colours of yarn, especially in spring. I have always been drawn to bright colours, but that is exactly what makes garment planning hard — a bright green might not always go with a bright blue or pink, and you cannot tell until you see it on the garment. That frustration is what triggered ChromaKnit in the first place, and it shaped the redesign too.

I wanted the UI to feel like the yarn itself: warm, textured, colourful. The background image is a real yarn photo with no filters or overlays darkening it, because the whole point of the app is colour and I did not want to mute that. The frosted glass panel over the top was the solution to keeping the text readable without killing the vibrancy — it took a few iterations to get the opacity right, but the final version lets the yarn colours show through while the blur keeps the white text sharp.

The cat and yarn ball loading animation was inspired by the offline browser games (the Chrome dinosaur, Safari's surfing game). I have spent time in a room with a cat that loves to play with yarn, and it felt like the perfect personality touch for a knitting app. It turns a wait state into something that makes you smile.

### Requirements

1. Distinctive visual identity that appeals to knitters and crafters
2. Progressive step-based workflow that guides users through the process
3. Keep all existing API logic unchanged (color extraction + garment recolour)
4. No new dependencies — pure CSS + React components
5. Responsive and accessible

---

## Decision

### Design System

**Typography:**
- Headings: Cormorant Garamond (serif, italic accents) — elegant, craft-appropriate
- Body: DM Sans (sans-serif) — clean, readable

**Colour Palette:**
| Token | Hex | Usage |
|-------|-----|-------|
| `--rose` | #E87B8B | Accents, step titles, buttons |
| `--blush` | #F2AEBC | Italic headings, info buttons, highlights |
| `--lavender` | #C9B8D8 | Upload done state, slider accent |
| `--sage` | #9BB89A | Colour dot |
| `--sky` | #A8C8DC | Colour dot |
| `--peach` | #F0A882 | Colour dot |
| `--mustard` | #D4A843 | Colour dot |
| `--cream` | #FAF6F0 | Steps background |
| `--dark` | #2A1F28 | Text colour |

**Background:** Full-page yarn photo (`public/header-yarn-background.jpg`) with no colour overlay. The frosted glass panel handles readability.

### Layout: Two Zones

**1. Header (full viewport height)**
- Fixed yarn photo background covering the entire page
- Floating pastel petal animations (24 divs, CSS keyframes, `pointer-events: none`)
- Frosted glass panel: `backdrop-filter: blur(28px) saturate(1.2)` with dark tint background
- Headline, tagline, colour dots, CTA button, collapsible builder notes
- Steps section hidden until "try it now" is clicked

**2. Steps Section (cream background, scrollable)**
- Fades in on CTA click with CSS animation
- Three progressive steps, each revealed after the previous completes:
  - Step 1: Upload yarn → extracted colour palette appears inline
  - Step 2: Upload garment → recolour button → cat loading animation
  - Step 3: Draggable before/after comparison slider with download

### Component Architecture

```
App.tsx (state + API logic)
├── PetalBackground.tsx    — fixed bg + overlay + 24 floating petals
├── Header.tsx             — headline, tagline, dots, CTA, builder notes
│   └── BuilderNotes.tsx   — collapsible tech stack / benchmarks panel
├── StepSection.tsx        — reusable wrapper (number, label, title, children)
├── InfoPanel.tsx          — short text + (i) button + collapsible detail
├── UploadZone.tsx         — styled file input (dashed border, done state)
├── ColorPalette.tsx       — swatches + distribution bar
├── LoadingCat.tsx         — configurable loading (simple or cat animation)
└── BeforeAfter.tsx        — drag/touch slider comparing two images
```

**Key decision:** All state remains in App.tsx. Components are purely presentational with props and callbacks. No Context, no Redux, no state management library.

---

## Options Considered

### Option 1: CSS Framework (Tailwind, Chakra UI)

**Pros:** Fast development, consistent spacing, responsive utilities

**Cons:** Adds dependency, harder to achieve the specific frosted glass aesthetic, class name bloat for custom designs

**Verdict:** Rejected — the design is too custom for utility-first CSS to be a net win. Pure CSS gives full control with zero overhead.

### Option 2: Keep Flat Layout, Just Restyle

**Pros:** Minimal code changes, lower risk

**Cons:** Doesn't solve the workflow UX problem. Steps 1 and 2 showing simultaneously is confusing.

**Verdict:** Rejected — progressive disclosure (showing steps one at a time) is a better UX for a guided workflow.

### Option 3: Full Redesign with Component Breakdown (Selected)

**Pros:** Clean separation of concerns, progressive step reveal, distinctive visual identity, all API logic preserved

**Cons:** More files to maintain, larger CSS surface area

**Verdict:** Selected — the component count (9 new files) is justified by the UX improvement and each component is small and focused.

---

## Implementation Details

### Frosted Glass Effect

The header panel uses a combination of techniques to achieve readable text over a busy yarn photo background:

```css
.headline-block {
  background: rgba(30, 15, 25, 0.45);
  backdrop-filter: blur(28px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}
```

The background overlay on the page itself is `none` — the yarn photo shows with original colours. Only the glass panel adds opacity.

### Progressive Step Reveal

Steps are controlled by existing state variables, no new state needed:
- Step 1 always visible (after "try it now")
- Palette appears inside Step 1 when `extractedColors.length > 0`
- Step 2 appears when `extractedColors.length > 0`
- Step 3 appears when `recoloredImageUrl` exists

### Before/After Slider

- Uses `clip-path: inset()` on the "after" layer to reveal/hide
- Mouse drag + touch support + range input fallback
- Original garment on left, recoloured on right
- Download button creates a blob URL download

### Loading States

Two variants of the same component:
- **Step 1 (yarn extraction):** Simple progress bar with "gathering pixels..."
- **Step 2 (garment recolour):** Cat + yarn ball SVG animation with "recolouring your garment..."

The cat animation adds personality without blocking the UI.

### Petal Animation

24 `div` elements generated on mount with randomised:
- Position (0-100% left)
- Size (7-16px)
- Colour (from palette)
- Duration (6-14s)
- Delay (0-12s)

All petals use `pointer-events: none` and `z-index: 2` so they never block interaction.

---

## Trade-offs Accepted

### 1. Single CSS File

**Trade-off:** All styles in App.css (~500 lines) rather than CSS modules or co-located styles

**Justification:** Matches existing project convention, easy to search and refactor, no build tooling changes needed

### 2. No Dark Mode

**Trade-off:** Removed the default Vite dark/light mode support

**Justification:** The design is intentionally light and warm to match the craft aesthetic. Dark mode would require a completely different colour system.

### 3. External Font Loading

**Trade-off:** Google Fonts loaded via `<link>` in index.html (network dependency)

**Justification:** Cormorant Garamond is critical to the design identity. Self-hosting adds build complexity for minimal gain. Falls back to system serif gracefully.

### 4. Background Image in public/

**Trade-off:** Hero image served as a static file rather than imported through Vite

**Justification:** Avoids base64 encoding a large JPEG. Files in `public/` are served directly at the root URL with proper caching.

---

## Files Changed

| File | Change |
|------|--------|
| `index.html` | Added Google Fonts link, updated title |
| `src/index.css` | Replaced Vite defaults with design system variables and keyframes |
| `src/App.css` | Complete rewrite — all component styles (~500 lines) |
| `src/App.tsx` | Rewritten to compose new components, all API logic preserved |
| `src/components/Header.tsx` | New — header section with frosted glass panel |
| `src/components/PetalBackground.tsx` | New — fixed background + overlay + petals |
| `src/components/BuilderNotes.tsx` | New — collapsible dev panel |
| `src/components/StepSection.tsx` | New — reusable step wrapper |
| `src/components/InfoPanel.tsx` | New — short text + expandable detail |
| `src/components/UploadZone.tsx` | New — replaces ImageUpload.tsx |
| `src/components/ColorPalette.tsx` | New — swatches + distribution bar |
| `src/components/LoadingCat.tsx` | New — configurable loading animation |
| `src/components/BeforeAfter.tsx` | New — draggable comparison slider |
| `public/header-yarn-background.jpg` | New — header background image |

**14 files changed, 1106 insertions, 325 deletions**

---

## Result

Before: Default Vite dark theme, flat form layout, no visual identity
After: Distinctive frosted glass design with progressive step workflow, branded typography, and interactive before/after comparison

The redesign preserves all existing functionality while giving ChromaKnit a visual identity that matches its craft audience.

---

## Lessons Learned

**Having a colour palette in mind from the start makes everything cohesive.** The nine-token palette (rose, blush, lavender, sage, sky, peach, mustard, cream, dark) was defined before any components were built. Every button, border, loading bar, and accent pulls from the same set. This meant I never had to make ad-hoc colour decisions mid-build — the system answered those questions for me.

**Frosted glass is harder than it looks.** The `backdrop-filter` blur picks up whatever colours are behind it, so a busy yarn photo turns the panel into a muddy mix. The fix was a darker background tint (`rgba(30,15,25,0.45)`) combined with a strong blur (`28px`) and saturation boost. Getting the balance between "frosted" and "readable" took several rounds of tuning.

**Loading states are a design opportunity, not a nuisance.** The cat animation turns a 2-7 second wait into a moment of personality. Users are more patient when they are entertained.

---

## Future Enhancements

- Adding more whimsical interactive elements — small React animations, hover effects on yarn swatches, micro-interactions that make the app feel playful
- Potential dark mode variant for evening knitters (would need a separate colour system)
- Drag-and-drop file upload (currently click-to-upload styled as a dropzone)
- Mobile-first responsive pass for smaller screens

---

## References

- [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond)
- [DM Sans](https://fonts.google.com/specimen/DM+Sans)
- [backdrop-filter MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)
- ADR 004: React Frontend Architecture (original frontend decisions)

---

## Revision History

- **April 2026:** Initial redesign implemented on `ui-design` branch

---

**Decision Owner:** Joyce Chong
**Review Date:** Post-deployment
