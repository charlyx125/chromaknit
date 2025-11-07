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
