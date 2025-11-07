# ChromaKnit Development Log

*Building a computer vision tool to visualize yarn colors before purchase*

**Author:** Joyce Chong  
**Started:** November 2025  
**Status:** In Development - Phase 1  
**Repository:** [github.com/charlyx125/chromaknit](https://github.com/charlyx125/chromaknit)

---

## Table of Contents
1. [Phase 0: The Problem](#phase-0-the-problem)
2. [Phase 1: Color Extraction](#phase-1-color-extraction)
3. [Phase 2: Garment Recoloring](#phase-2-garment-recoloring)

---

## Phase 0: The Problem

### The Expensive Mistake

I fell in love with the Eilda Cardigan from Wool and the Gang - a beautiful knit that required three different yarn colors. The example on the website used orange tones, which wouldn't suit my skin tone. I love purples, pinks, and cool-toned colors, so I wanted to swap the palette.

Simple, right? Wrong.

### Attempt #1: The Three-Tab Method

I opened three browser tabs on my phone, each showing a different yarn color zoomed in. My logic: if I could see them all at once, I could visualize how they'd look together.

**Why it failed:** The tabs weren't touching. Black and white margins separated the images. Color theory tells us we never see colors in isolation - they interact with 
each other through a phenomenon called "simultaneous contrast." 

Example: The same grey looks lighter on a black background and darker on a 
white background. The grey hasn't changed - only what surrounds it.
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
⬛⬜⬛⬜  (50% black, 50% white)
⬜⬛⬜⬛  Big squares, equal amounts

**Thin Blackstrips on and white:** Clean, classic, mostly white with black accents
▓▓▓▓▓▓▓▓  (90% white, 10% black)
▓▓▓▓▓▓▓▓  Thin black lines on white

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

## Phase 1: Color Extraction

### Goal
Extract the dominant colors from yarn photos to serve as input for garment recoloring.

The core challenge: Yarn photos contain multiple colors (variegation, texture, shadows). I need to reduce this complexity to 3-5 representative colors that capture what the yarn actually looks like.

### Week 1: Initial Implementation (November 7, 2025)

**What I Built:**

A Python script (`yarn_color_extractor.py`) that:
1. Loads yarn image from `photos/` folder
2. Converts from BGR (OpenCV default) to RGB color space
3. Reshapes image data for clustering algorithm
4. Applies K-means clustering to find 5 dominant colors
5. Sorts colors by frequency (most common first)
6. Converts RGB values to hex codes for easy reference
7. Generates a visualization showing original image + extracted palette
8. Saves output to `results/` folder

**Technical Stack:**

- **Python 3.10+** - Primary language (familiar from my SE work)
- **OpenCV** - Image loading and color space conversion. Industry standard for computer vision tasks.
- **NumPy** - Array manipulation and numerical operations. Essential for efficient pixel-level operations.
- **scikit-learn (K-means)** - Clustering algorithm. Well-tested implementation, easy to use.
- **Matplotlib** - Visualization. Creates side-by-side comparison of yarn photo and extracted colors.

### Key Technical Decisions

#### Why K-means Clustering?

**The Problem:** A yarn photo might contain 100,000+ unique pixel colors. I need to reduce this to ~5 representative colors.

**Why K-means:**
1. **Proven for color quantization** - Standard approach in computer vision for reducing color palettes
2. **Unsupervised learning** - Don't need labeled training data, works on any yarn photo
3. **Configurable cluster count** - Can easily adjust from 5 to 3 or 7 colors based on yarn type
4. **Fast** - Converges quickly even on high-resolution images
5. **Available in scikit-learn** - Mature, well-documented implementation

**Alternatives I considered:**
- **Mean-shift clustering** - Too slow, harder to control number of colors
- **Manual color binning** - Would require threshold tuning for each yarn type
- **Median cut algorithm** - Good for palette reduction but less flexible than K-means

**Decision:** K-means offers the best balance of simplicity, speed, and quality for an MVP.

---

#### Why 5 Colors?

**The Reasoning:**

Based on observation of yarn types:
- **Solid yarns:** Usually 1-2 colors (base color + slight variation from lighting/texture)
- **Variegated yarns:** Typically 3-5 distinct color sections
- **Speckled/tweed yarns:** Could have 5+ colors but usually 2-3 dominant ones

**Why not fewer?**
- 3 colors might miss subtle color variations in complex variegated yarns
- Missing colors could affect the final garment visualization

**Why not more?**
- 7-10 colors would include too many artifacts (shadows, background bleed)
- More colors make it harder for users to understand which are "real" yarn colors
- Increases computational time

**The Decision:** Start with 5 as a reasonable middle ground. Can make this configurable later based on user feedback.

**Trade-off I'm accepting:** Some very simple solid-color yarns might have 2-3 "duplicate" shades extracted. This is okay - it shows color variation under different lighting, which could actually be useful.

---
#### Why Sort by Frequency?

**The Problem:** K-means returns cluster centers (colors) in arbitrary order. Without sorting, the extracted colors are random each time.

**Why frequency-based sorting matters:**

1. **Most dominant color matters most** - In a 90% blue, 10% white variegated yarn, blue should be ranked #1
2. **Proportions affect perception** - A user needs to know "this is the primary color, these are accents"
3. **Consistency** - Same yarn should always produce same color order across multiple runs
4. **User understanding** - "Color 1 = 45%, Color 2 = 23%" is more meaningful than arbitrary ordering

**Example of why this matters:**

Extracting colors from blue variegated yarn:

**Without sorting (random order):**
```
#2e5c8a (dark blue) - 15%
#a8d8ea (light blue) - 45%  ← Most common but listed second!
#5b9bd5 (medium blue) - 23%
```

**With sorting (by frequency):**
```
#a8d8ea (light blue) - 45%   ← Clearly the dominant color
#5b9bd5 (medium blue) - 23%
#2e5c8a (dark blue) - 15%
```

**The impact on garment recoloring:**

When I eventually recolor garments, I'll likely map:
- Garment's primary color → Yarn color #1 (most dominant)
- Garment's accent colors → Yarn colors #2, #3, etc.

Without frequency sorting, this mapping would be nonsensical.

---

### Challenges Encountered

#### Challenge #1: The Close-Up vs. Distance Problem

**Date:** November 7, 2025

**The Issue:**

When extracting colors from close-up yarn photos, the algorithm picks up dark values (#1a1a1a, #2e2e2e) that don't represent the actual yarn color. These come from:
- Shadows between knots in the yarn texture
- Gaps in the yarn structure
- Lighting artifacts
- Background bleed if yarn isn't properly isolated

**Example from testing:**

Blue variegated yarn extraction produced:
1. `#6b9bd1` - Light blue (45%) ✓ Legitimate yarn color
2. `#4a7ba9` - Medium blue (23%) ✓ Legitimate yarn color
3. `#355a7f` - Dark blue (15%) ⚠️ Could be shadow or actual color
4. `#2e2e2e` - Near-black (10%) ✗ Likely artifact
5. `#8fb5d8` - Pale blue (7%) ✓ Legitimate yarn color

**The Core Question:**

Should I filter out very dark colors, or could they be needed for realistic garment recoloring?

**Arguments for filtering:**
- Shadows in yarn photos don't represent how the yarn looks when knitted from a distance
- Dark artifacts could make recolored garments look muddy
- Human perception: colors blend together when viewed from 3 feet away vs. 3 inches (optical color mixing)

**Arguments against filtering:**
- Garment photos have their own shading/texture - we might need to preserve dark tones
- Intentionally dark yarns (navy, charcoal) would be incorrectly filtered out
- Ombre or gradient yarns legitimately transition to dark values

**Hypothesis I'm Exploring:**

The shading in a garment photo comes from how light hits the fabric, NOT from the yarn's intrinsic color. Therefore:
- Garment already has shadows and texture baked in
- We only need the "true" yarn colors
- Dark artifacts from close-up photos should be filtered

**BUT** - I don't know if this hypothesis is correct until I implement garment recoloring and test both approaches.

**Current Decision: Postpone filtering until Phase 2**

**Reasoning:**
1. I don't have enough data yet - need to see how colors actually look when applied to garments
2. Better to keep all information now and filter later if needed (vs. removing data prematurely)
3. Can A/B test: recolor same garment with filtered vs. unfiltered colors, visually compare results
4. Might make filtering user-configurable rather than automatic

**Related Documentation:**
- **[Decision Record 001: Color Filtering Strategy](decisions/001-color-filtering-strategy.md)** - Full analysis of filtering options, testing plan, and consequences

**Next Steps:**
- Test color extraction on multiple yarn types (solid, variegated, ombre, speckled)
- In Phase 2, implement both filtered and unfiltered approaches
- A/B test with real garment recoloring
- Make data-driven decision based on visual results

**What This Teaches Me:**

Not all technical decisions can be made upfront. Sometimes you need to build more to gather data. This is okay - it's better to acknowledge uncertainty than to prematurely optimize based on assumptions.

---

#### Challenge #2: Background Removal

**Date:** November 7, 2025

**Status:** Identified but not yet addressed

**The Issue:**

Current implementation extracts colors from the entire image, including background, hands, surfaces, etc. This pollutes the color palette with non-yarn colors.

**Example impact:**
- Yarn on wooden table → brown pixels extracted as "yarn color"
- Hand holding yarn → skin tone pixels in palette
- Shadow from lighting → grey pixels counted as dominant

**Demonstration:**

Same yarn, different photo contexts:

**Clean product photo:**
```
1. #6b9bd1 (45%) ← Actual yarn
2. #4a7ba9 (23%) ← Actual yarn
3. #8fb5d8 (15%) ← Actual yarn
4. #355a7f (10%) ← Actual yarn
5. #9ac4e3 (7%)  ← Actual yarn
```

**Photo with wooden table background:**
```
1. #8B7355 (32%) ← Wooden table!
2. #6b9bd1 (28%) ← Actual yarn
3. #4a7ba9 (18%) ← Actual yarn
4. #2e2e2e (12%) ← Shadow
5. #FFC9A8 (10%) ← Hand/skin tone
```

**Why I'm Not Solving This Yet:**

Phase 1 focus is on the color extraction algorithm itself. I can manually crop images as a workaround for now. Proper background removal will be implemented in Phase 1.5 (after color extraction works, before garment recoloring).

**Planned Solution:**

Use Rembg library for automatic background removal. If quality is insufficient, add manual selection UI as fallback.

**Related Documentation:**
- **[Decision Record 002: Background Removal Strategy](decisions/002-background-removal.md)** - Full analysis of removal options, implementation plan, and testing strategy

**Current Workaround:**

For Phase 1 testing, I'm using photos with:
- Plain backgrounds (white or neutral)
- Yarn filling most of the frame
- Manual pre-cropping when needed

**What This Teaches Me:**

It's okay to have known limitations in an MVP. The key is to:
1. Document them clearly
2. Have a plan to address them
3. Don't let them block core functionality
4. Prioritize based on impact

---

### Testing & Results

**Test 1: Blue Variegated Yarn**
- **File:** `Shiny-Happy-Cotton_SHC_Cornflower-Blue_SWATCH.jpg`
- **Type:** Variegated (multiple blue tones)
- **Colors extracted:** 5 colors ranging from light to dark blue
- **Observation:** One very dark color appears to be a shadow artifact
- **Conclusion:** Algorithm works as intended, but Challenge #1 (artifact filtering) confirmed

**Success Criteria:**
- ✅ Correctly identified 4-5 legitimate yarn colors
- ✅ Colors sorted by frequency (most dominant first)
- ✅ Hex codes generated accurately
- ✅ Visualization clearly shows extracted palette
- ⚠️ One artifact color detected (expected, will address in Phase 2)

**Test 2-N:** *(To be added as I test more yarn types)*

Planned test yarns:
- Solid color yarn (simple case)
- Ombre/gradient yarn (intentionally dark transitions)
- Speckled yarn (many small color variations)
- High-contrast yarn (e.g., black and white)

---

## Phase 2: Garment Recoloring

*Coming soon (Target: December 2025)*

### Planned Approach

**Goal:** Take a catalog garment photo and recolor it with the user's yarn colors while preserving texture, shading, and proportions.

**Technical Challenges to Solve:**
1. **Segmentation** - Isolate garment from background/model
2. **Color mapping** - Map garment's original colors to new colors
3. **Preserve texture** - Keep knit texture, don't create flat color blocks
4. **Maintain realism** - Shadows and highlights should remain natural

**Potential Approaches:**
- **Option A:** HSV color transfer (simpler, faster)
- **Option B:** Segment Anything Model (SAM) + advanced recoloring (higher quality)
- **Option C:** Hybrid approach

**Decision pending:** Need to research and prototype both approaches.

**This is where Challenge #1 gets resolved:**
- Test garment recoloring with filtered colors
- Test garment recoloring with unfiltered colors
- Visual comparison to determine which looks more realistic
- Make data-driven decision

---

## Lessons Learned

### Technical Insights
- K-means is surprisingly effective for color quantization
- Sorting by frequency is essential - raw cluster order is meaningless
- Some decisions can't be made until you build more (the dark color filtering question)
- Optical color mixing at distance is a real perceptual phenomenon that affects yarn visualization

### Process Insights  
- Documentation is easier when done concurrently with building (not after the fact)
- Explaining "why" is as important as documenting "what"
- Real-world problem experience drives better technical decisions
- It's okay to postpone decisions when you don't have enough data

### What Surprised Me
- How much yarn photography inconsistency affects color perception
- The complexity hidden in "simple" color visualization problems
- How proportion changes completely alter color interaction (the black/white stripe example)
- That sometimes the best decision is to explicitly NOT decide yet

### What I'd Do Differently
*(To be filled as project progresses)*

---

## References

### Technical Resources
- [K-means clustering documentation](https://scikit-learn.org/stable/modules/clustering.html#k-means)
- Color theory: Simultaneous contrast and optical color mixing
- Computer vision: Color space conversions (RGB, HSV, LAB)

### Inspiration
- [Wool and the Gang - Eilda Cardigan](https://www.woolandthegang.com/) - The pattern that sparked this project
- Personal frustration with online yarn shopping

### Related Work
- Color palette generators (Coolors, Adobe Color)
- Virtual try-on tools in fashion industry
- Image recoloring research in computer vision

---

**Last Updated:** November 7, 2025
