# ChromaKnit Development Log

_Building a computer vision tool to visualize yarn colors before purchase_

**Author:** Joyce Chong  
**Started:** November 2025  
**Status:** Phase 1 Complete ✅ | Phase 2 Complete ✅ | Phase 3 Starting 🚀  
**Repository:** [github.com/charlyx125/chromaknit](https://github.com/charlyx125/chromaknit)

---

## Table of Contents

1. [Phase 0: The Problem](#phase-0-the-problem)
2. [Phase 1: Color Extraction](#phase-1-color-extraction) ✅
3. [Phase 2: Garment Recoloring](#phase-2-garment-recoloring) ✅
4. [Lessons Learned](#lessons-learned)

---

## Phase 0: The Problem

### The Expensive Mistake

I fell in love with the Eilda Cardigan from Wool and the Gang - a beautiful knit that required three different yarn colors. The example on the website used orange tones, which wouldn't suit my skin tone. I love purples, pinks, and cool-toned colors, so I wanted to swap the palette.

Simple, right? Wrong.

### Attempt #1: The Three-Tab Method

I opened three browser tabs on my phone, each showing a different yarn color zoomed in. My logic: if I could see them all at once, I could visualize how they'd look together.

**Why it failed:** The tabs weren't touching. Black and white margins separated the images. Color theory tells us we never see colors in isolation - they interact with each other through a phenomenon called "simultaneous contrast."

Example: The same grey looks lighter on a black background and darker on a white background. The grey hasn't changed - only what surrounds it.

### Attempt #2: Finding Other Products

I searched for other projects on the website using the same yarns, hoping to see my color combination in context.

**Why it failed:** The same yarn looked completely different across photos! One photo showed a lilac that looked grey. Another made it look bright purple. Lighting, photography, and neighboring colors made the "same" yarn appear warmer or cooler depending on the image. I couldn't trust any single representation.

### Attempt #3: Hex Code Analysis

I got technical. I used color picker tools. I even created a mockup in Canva, layering the hex codes to simulate stripes.

**Why it failed:** Yarn isn't a single hex color - it's a combination of fibers that create complex, variegated tones. A simple `#D8B9D8` lilac swatch in Canva looked nothing like the actual textured, multi-tonal yarn. Plus, viewing colors up close on a screen is completely different from viewing them on a garment worn at arm's length.

### The Final Realization

When I finally saw the colors together after buying the kit, I discovered:

- The lilac looked grey next to the light pink
- The light pink looked warm compared to the lilac and dark pink

These interactions were **impossible to predict** from individual yarn photos.

### The Real Problem

I was furious. Not at the website, but at the situation. I love knitting, but there are no yarn stores near me. The closest is 2 hours away, so online shopping is my only option. Yarn is expensive (£20-30 per skein), and most places don't accept returns once purchased.

I wished yarn websites would show **every color combination on the actual product**, but that's unrealistic - the permutations would be endless.

So I was stuck relying on intuition and imagination to predict how three different colors in different proportions would interact. And humans are terrible at this.

### Why This is So Hard

The proportion problem is real. Look at these examples:

**Black and white in large blocks:** Bold, graphic, balanced  
⬛⬜⬛⬜⬛⬜⬛ Big squares, equal amounts

**Thin black strips on white:** Clean, classic, mostly white with black accents  
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (90% white, 10% black) Thin black lines on white

Same colors, completely different visual impact.

We're familiar with black and white, so we can imagine the difference. But ask me to visualize:

- 60% dusty lilac
- 30% light pink
- 10% purplish-pink

...in a cardigan with textured cable knit patterns? **Impossible.**

### The Solution: ChromaKnit

That's why I'm building ChromaKnit - a tool that lets you preview YOUR yarn colors in ANY garment pattern before purchasing.

**How it works:**

- **Input:** A garment photo (in the original colors) + your proposed yarn colors
- **Process:** Computer vision extracts color proportions and recolors the garment realistically
- **Output:** A preview showing exactly how your colors will look in that specific pattern

**The result:** Confident purchasing decisions. No more £60 worth of yarn that looks wrong when knitted together.

---

## Phase 1: Color Extraction ✅

**Status:** Complete (November 7-14, 2025)

### Goal

Extract the dominant colors from yarn photos to serve as input for garment recoloring.

The core challenge: Yarn photos contain multiple colors (variegation, texture, shadows). I need to reduce this complexity to 3-5 representative colors that capture what the yarn actually looks like.

### Implementation Summary

**What I Built:**

A robust `ColorExtractor` class that:

1. Loads yarn image from disk
2. Converts from BGR (OpenCV default) to RGB color space
3. Reshapes image data for clustering algorithm
4. Applies K-means clustering to find N dominant colors (configurable, default 5)
5. Sorts colors by frequency (most common first)
6. Converts RGB values to hex codes for easy reference
7. Generates a visualization showing original image + extracted palette with percentages
8. Saves output to `results/` folder

**Technical Stack:**

- **Python 3.11+** - Primary language
- **OpenCV (cv2)** - Image loading and color space conversion
- **NumPy** - Array manipulation and numerical operations
- **scikit-learn (K-means)** - Clustering algorithm
- **matplotlib** - Visualization

**Architecture:**

- Modular class design with single responsibility principle
- Private helper methods (`_preprocess_image`, `_cluster_colors`, etc.)
- Comprehensive error handling
- Configurable parameters (n_colors, output paths)

### Key Technical Decisions

#### Decision 001: K-means Clustering for Color Extraction

**Why K-means:**

1. Industry standard for color quantization
2. Fast execution (~1-2 seconds for typical images)
3. Consistent results with `random_state=42`
4. Works automatically on any image
5. Provides frequency information (pixel counts per cluster)

**See:** [Decision Record 001: Color Extraction Algorithm Selection](decisions/001-color-extraction-algorithm.md)

#### Why 5 Colors by Default?

Based on yarn type analysis:
- Solid yarns: 1-2 colors
- Variegated yarns: 3-5 colors
- Speckled/tweed: 5+ but 2-3 dominant

5 colors captures most yarn types without including excessive artifacts.

#### Why Sort by Frequency?

Essential for meaningful recoloring:
- Most common color = primary garment color
- Secondary colors = accents/highlights
- Provides proportion information (45% vs. 10%)

---

### Testing & Results

#### Test 1: Blue Variegated Yarn ✅

**Input:** `examples/sample-yarn.jpg` (Shiny-Happy-Cotton_SHC_Cornflower-Blue_SWATCH.jpg, 1200×940 pixels)

**Colors Extracted:**
1. `#142a68` (29.21%) - Dark navy blue ✓
2. `#23438d` (24.98%) - Medium blue ✓
3. `#0c153b` (18.04%) - Very dark navy ⚠️ (likely shadow/gap between fibers)
4. `#3e64b2` (17.32%) - Bright blue ✓
5. `#658ad6` (10.45%) - Light blue ✓

**Performance:**
- Extraction time: 1.2 seconds
- Memory usage: ~15MB
- Reproducibility: 100% (same results every run)

**Accuracy:** 4 out of 5 colors accurately represent the yarn. One color (#0c153b) appears to be a shadow artifact from the close-up photo.

**Observation:** The very dark navy (#0c153b) is questionable - it could be:
- Legitimate dark fiber color in the variegated yarn
- Shadow cast between the knitted stitches
- Gap/space in the yarn structure captured by the camera

This ambiguity validates Challenge #1 - determining which colors are "real" vs. artifacts requires context from garment recoloring testing.

**Visualization:** Generated side-by-side comparison showing yarn photo and extracted color palette with percentages (saved to `results/yarn_colors.png`)

---

#### Unit Tests: 23 tests, 99% coverage ✅

**Test Suite Coverage:**
- Initialization tests (default and custom parameters)
- Image loading (success and failure cases)
- Color space conversion (BGR ↔ RGB)
- RGB to hex conversion (pure and mixed colors)
- Preprocessing pipeline
- Image reshaping for clustering
- K-means clustering (correct number of clusters)
- Frequency-based sorting (descending order verification)
- Full extraction pipeline (integration tests)
- Visualization generation
- Different n_colors values (1, 3, 5, 10)

**Coverage Report:**
```
Name                           Stmts   Miss  Cover
--------------------------------------------------
core/yarn_color_extractor.py     106      1    99%
```

**Command:** `pytest tests/test_color_extractor.py --cov=core.yarn_color_extractor --cov-report=term-missing`

---

#### Performance Benchmarks ✅

**Benchmark Results:**

| Image Size | Dimensions | Total Pixels | Extraction Time |
|------------|------------|--------------|-----------------|
| Small      | 300×300    | 90,000       | 0.234s          |
| Medium     | 800×800    | 640,000      | 1.456s          |
| Large      | 1920×1080  | 2,073,600    | 3.892s          |

**Conclusion:** Fast enough for interactive use. Scales linearly with pixel count.

**Command:** `python benchmarks/benchmark_color_extractor.py`

---

### Challenges Encountered

#### Challenge #1: Shadow/Artifact Colors

**Issue:** Close-up yarn photos capture shadows between fibers, lighting artifacts, and texture gaps as distinct "colors."

**Example:** Blue yarn extraction included `#0c153b` (very dark navy) - unclear if legitimate color or shadow artifact.

**Decision:** Keep all extracted colors (no filtering) for Phase 1. Will evaluate impact during garment recoloring in Phase 2.

**Rationale:**
- Shadows might contribute to realistic appearance
- Premature filtering could remove legitimate dark colors
- Better to gather data first, then decide

**See:** [Decision Record 001](decisions/001-color-extraction-algorithm.md) for full analysis

---

#### Challenge #2: Background Pixels

**Issue:** Photos with backgrounds (tables, hands, surfaces) pollute the color palette with non-yarn colors.

**Initial Workaround:** Manual cropping to isolate yarn

**Permanent Solution:** Implemented in Phase 2 (see below)

---

### Phase 1 Deliverables ✅

- [x] ColorExtractor class with modular architecture
- [x] K-means clustering implementation
- [x] Frequency-based color sorting
- [x] Hex code output
- [x] Visualization generation
- [x] 23 unit tests with 99% coverage
- [x] Performance benchmarks
- [x] Comprehensive documentation
- [x] Decision records (001)

**Status:** Phase 1 Complete! ✅

---

## Phase 2: Garment Recoloring ✅

**Status:** Complete (November 14, 2025)

### Goal

Take a garment photo and recolor it with extracted yarn colors while preserving texture, shadows, and lighting for realistic results.

### Implementation Summary

**What I Built:**

A `GarmentRecolorer` class that:

1. Loads garment image from disk
2. Removes background automatically using AI (rembg library)
3. Extracts binary mask identifying garment pixels
4. Applies yarn colors using HSV color space transformation
5. Preserves original brightness (V channel) to maintain texture
6. Distributes multiple yarn colors based on brightness levels
7. Saves recolored result

**Technical Stack:**

- **rembg** - AI-powered background removal (U²-Net model)
- **onnxruntime** - ML model execution
- **OpenCV (cv2)** - Image processing
- **NumPy** - Array operations and masking

**Architecture:**

- Modular class design matching ColorExtractor pattern
- Separate methods for each processing step
- HSV color space for perceptually accurate recoloring
- Mask-based selective pixel modification

---

### Key Technical Decisions

#### Decision 002: Background Removal Strategy

**Selected:** rembg library with U²-Net model

**Why rembg:**
1. Fully automatic (no user input required)
2. High quality segmentation
3. Simple one-line API
4. Fast execution (2-3 seconds)
5. Well-maintained, battle-tested

**See:** [Decision Record 002: Background Removal Strategy](decisions/002-background-removal-strategy.md)

---

#### Decision: HSV Color Space for Recoloring

**The Problem:** Simple BGR color replacement creates flat, unrealistic results:
```python
# ❌ WRONG: Flat, uniform color (loses texture)
image[mask > 0] = (0, 0, 255)  # All pixels become same blue
```

**The Solution:** HSV color space transformation preserves brightness:

```python
# ✅ CORRECT: Preserves texture and lighting
image_hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
image_hsv[mask > 0, 0] = new_hue        # Change color
image_hsv[mask > 0, 1] = new_saturation # Change intensity
# V channel (brightness) unchanged → preserves shadows, highlights, texture!
```

**Why This Works:**

HSV separates:
- **H**ue = the actual color (red, blue, green)
- **S**aturation = color intensity
- **V**alue = brightness/luminance

By changing only H and S while keeping V:
- Dark folds stay dark (but change color)
- Highlights stay bright (but change color)
- Knit texture remains visible
- Shadows and depth preserved

**Real-World Result:**

Yellow cardigan → Blue cardigan:
- ✅ Knit texture visible
- ✅ Pocket shadows preserved
- ✅ Cable knit depth maintained
- ✅ Realistic appearance

---

#### Decision: Multi-Color Distribution

**Enhancement:** Instead of applying just one yarn color, distribute all 5 extracted colors across the garment based on brightness.

**Algorithm:**
1. Sort yarn colors by brightness (darkest to lightest)
2. Analyze garment pixel brightness distribution
3. Map darkest garment areas → darkest yarn color
4. Map mid-tone garment areas → mid-tone yarn color
5. Map lightest garment areas → lightest yarn color

**Result:** More realistic appearance with subtle color variation matching the actual yarn.

---

### Testing & Results

#### Test 1: Yellow Cardigan → Blue Yarn ✅

**Input:**
- **Garment:** Yellow knitted cardigan (1200×940px) - `examples/sample-garment.jpg`
- **Yarn:** Blue variegated (`examples/sample-yarn.jpg`) with 5 color variations:
  - `#142a68` (29.21%) - Dark navy blue
  - `#23438d` (24.98%) - Medium blue
  - `#0c153b` (18.04%) - Very dark navy
  - `#3e64b2` (17.32%) - Bright blue
  - `#658ad6` (10.45%) - Light blue

**Output:** Successfully recolored blue cardigan with:
- ✅ Knit texture fully preserved
- ✅ Shadows under pockets maintained
- ✅ Cable knit patterns visible
- ✅ Natural-looking result
- ✅ Multiple blue tones distributed realistically based on brightness

**Processing Time:** ~8 seconds total
- Background removal: ~5-6 seconds
- Color application: ~2 seconds

**Before/After Comparison:**
- **Original:** Mustard yellow cardigan laid flat on white background
- **Result:** Navy/royal blue cardigan with all texture intact

**Observations & Known Issues:**

1. **Shadow Inclusion:** ✓ Expected behavior
   - The cardigan's natural shadow on the white background was also recolored blue
   - This is correct - shadows are part of the object detected by rembg
   - The shadow maintains its darker tone (darker blue) while the garment is brighter blue
   - Demonstrates that brightness preservation works correctly

2. **Garment-Only Detection:** Future improvement needed
   - **What we have:** Background removal that detects all foreground objects
   - **What we'd want eventually:** Garment-specific segmentation
   - **Current impact:** If testing with a photo of a person wearing the garment, the entire person would be recolored (face, hair, pants, etc.)
   - **Why this is acceptable for Phase 2:** 
     - Core recoloring algorithm works correctly
     - Demonstrates texture preservation
     - Professional garment photos (like catalogs) are laid flat without models
     - More sophisticated segmentation (SAM, garment-specific models) can be added in Phase 4

3. **Realistic Color Distribution:**
   - Darker areas of the cardigan (under pockets, folds) received darker yarn colors
   - Lighter areas (highlights, flat surfaces) received lighter yarn colors
   - This brightness-based mapping creates natural-looking results

**Success Criteria Met:**
- ✅ Colors applied from yarn extraction
- ✅ Texture preserved (knit stitches visible)
- ✅ Shadows maintained (darker blue in shadow areas)
- ✅ Multi-color distribution works
- ✅ Realistic final appearance

---

#### Unit Tests: 27 tests, 94% coverage ✅

**Test Suite Coverage:**
- Initialization tests (valid and invalid paths)
- Image loading (success and failure cases)
- Hex to BGR conversion (with and without # symbol)
- Background removal (success, failure, and error cases)
- Mask extraction and validation (shape, values, dimensions)
- Color application (multiple scenarios)
  - Without image/mask (error handling)
  - Successful application with image generation
  - Pixel value changes verification
- Save functionality (with and without recolored image)
- Full pipeline integration test

**Coverage Report:**
```
Name                      Stmts   Miss  Cover   Missing
-------------------------------------------------------
core\garment_recolor.py      86      5    94%   39-41, 126-127
-------------------------------------------------------
TOTAL                        86      5    94%
```

**Missing lines:** 
- Lines 39-41: Exception handling in `remove_background()` (hard to trigger in tests)
- Lines 126-127: `save_result()` error branches (acceptable - edge cases)

**Command:** `pytest tests/test_garment_recolor.py --cov=core.garment_recolor --cov-report=term-missing`

---

### Challenges Encountered

#### Challenge #3: Mask Indexing Bug

**Date:** November 14, 2025

**Issue:** Initial implementation had double mask indexing bug:

```python
# ❌ WRONG: Double indexing doesn't work as expected
recolored_hsv[garment_mask][mask_for_color, 0] = color[0]
```

**Symptom:** Recolored image looked identical to original despite debug showing "1 million pixels changed"

**Root Cause:** NumPy boolean indexing with nested masks creates a view that doesn't allow proper assignment.

**Solution:** Use `np.where()` to get actual pixel coordinates:

```python
# ✅ CORRECT: Get coordinates, then index directly
y_coords, x_coords = np.where(garment_mask)
y_for_color = y_coords[pixels_for_this_color]
x_for_color = x_coords[pixels_for_this_color]
recolored_hsv[y_for_color, x_for_color, 0] = color[0]
```

**Lesson Learned:** Always test intermediate results visually, not just with assertions. Debug output said it worked, but the actual image revealed the truth.

---

#### Challenge #4: BGR vs RGB Color Space Confusion

**Issue:** Hex colors needed to be converted to BGR (not RGB) for OpenCV.

**Example:**
- Hex: `#FF0000` (red)
- RGB: `(255, 0, 0)` ✓
- BGR: `(0, 0, 255)` ✓ (what OpenCV needs)

**Solution:** Created `hex_to_bgr()` utility that reverses R and B channels.

---

### Current Status & Known Limitations

**✅ Working:**
- Color extraction from yarn photos
- Background removal from garment images
- Realistic texture-preserving recoloring
- Multi-color distribution
- Full end-to-end pipeline

**⚠️ Known Limitations:**

1. **Over-segmentation - Recolors Entire Foreground:**
   - **Issue:** rembg removes entire foreground (all non-background objects)
   - **Impact:** 
     - ✓ Works perfectly for product photos (garment laid flat)
     - ✗ Would recolor entire person in model photos (face, hair, pants, shoes, hands)
   - **Why this happens:** U²-Net model detects "subject vs. background", not "garment vs. everything else"
   - **Acceptable for Phase 2:** Demonstrates core concept with product photography
   - **Future solution:** Add garment-specific segmentation (SAM with prompts, or fashion-specific models)

2. **Shadow Inclusion (Expected Behavior):**
   - **Observation:** Garment's cast shadow on background is also recolored
   - **Why this is correct:** Shadow is part of the detected foreground object
   - **Result:** Shadow maintains correct darkness (darker blue) while garment is brighter
   - **Demonstrates:** Brightness preservation working as intended

3. **Processing Time:** 8-10 seconds per image
   - **Acceptable for Phase 2:** Interactive but not real-time
   - **Future:** Optimize with caching, async processing, or lighter models

4. **Lighting Sensitivity:** Works best with evenly-lit photos
   - **Workaround:** Document best practices for photo selection
   - **Impact:** High-contrast lighting can create unexpected color distribution

---

### Phase 2 Deliverables ✅

- [x] GarmentRecolorer class implementation
- [x] rembg background removal integration
- [x] HSV color space transformation
- [x] Multi-color brightness-based distribution
- [x] 27 unit tests with 94% coverage
- [x] Real-world testing with yellow→blue cardigan
- [x] Decision records (002)
- [x] Refactored common utilities (hex conversion, image loading, print helpers)
- [x] Comprehensive documentation

**Status:** Phase 2 Complete! ✅

**Next Phase:** Backend API (Phase 3)

---

## Lessons Learned

### Technical Insights

**Color Extraction:**
- K-means is surprisingly effective for color quantization
- Sorting by frequency is essential - raw cluster order is meaningless
- Some decisions can't be made until you build more (the dark color filtering question)
- Optical color mixing at distance is a real perceptual phenomenon

**Garment Recoloring:**
- HSV color space is critical for realistic results
- Preserving brightness (V channel) maintains all texture and depth
- Simple BGR replacement creates flat, artificial-looking results
- Multi-color distribution adds realism vs. single uniform color
- Background removal quality directly impacts final result quality

### Process Insights

- Documentation is easier when done concurrently with building
- Explaining "why" is as important as documenting "what"
- Real-world problem experience drives better technical decisions
- It's okay to postpone decisions when you don't have enough data
- Visual testing reveals bugs that assertions miss
- Test-driven development catches errors early

### What Surprised Me

- How much yarn photography inconsistency affects color perception
- The complexity hidden in "simple" color visualization problems
- How proportion changes completely alter color interaction
- That sometimes the best decision is to explicitly NOT decide yet
- How critical the V channel is for texture preservation
- That a "simple" mask indexing bug can silently fail

### What I'd Do Differently

**If Starting Over:**

1. **Start with HSV from the beginning** - Would have saved time debugging flat colors
2. **Write visual verification tests earlier** - Debug output isn't enough
3. **Research color spaces before implementing** - Understanding HSV upfront would have helped
4. **Test with more diverse images sooner** - Edge cases reveal design issues

**What Worked Well:**

1. **Modular class design** - Easy to test and refactor
2. **Decision records** - Helped clarify thinking and document rationale
3. **Incremental development** - Phase 1 → Phase 2 progression felt natural
4. **Comprehensive testing** - Caught many bugs before integration

---

## Next Steps

### Phase 3: Backend API (Planned)

**Goal:** Create REST API for color extraction and garment recoloring

**Deliverables:**
- FastAPI application
- POST `/api/extract-colors` - Upload yarn photo, get colors
- POST `/api/recolor-garment` - Upload garment + colors, get result
- Request/response validation (Pydantic)
- Error handling and status codes
- API documentation (auto-generated)
- Integration tests

**Target:** December 2025

---

### Phase 4: Web Interface (Planned)

**Goal:** User-friendly web application

**Deliverables:**
- React frontend
- Drag-and-drop image upload
- Color palette preview
- Before/after garment comparison
- Responsive design
- Deployment (Vercel/Netlify + Railway/Render)

**Target:** January 2026

---

## References

### Technical Resources

- [K-means clustering documentation](https://scikit-learn.org/stable/modules/clustering.html#k-means)
- [rembg GitHub](https://github.com/danielgatis/rembg)
- [OpenCV color space conversions](https://docs.opencv.org/4.x/de/d25/imgproc_color_conversions.html)
- [HSV color space explanation](https://en.wikipedia.org/wiki/HSL_and_HSV)
- Color theory: Simultaneous contrast and optical color mixing

### Inspiration

- [Wool and the Gang - Eilda Cardigan](https://www.woolandthegang.com/) - The pattern that sparked this project
- Personal frustration with online yarn shopping

### Related Work

- Color palette generators (Coolors, Adobe Color)
- Virtual try-on tools in fashion industry
- Image recoloring research in computer vision

---

**Last Updated:** November 14, 2025  
**Current Phase:** 2 Complete ✅ | 3 (Backend API) Starting 🚀  
**Next Milestone:** REST API Implementation