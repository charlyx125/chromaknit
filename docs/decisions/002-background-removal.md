# Decision 002: Background Removal Strategy

**Date:** 2025-11-14  
**Status:** Accepted  
**Decision Makers:** Joyce Chong

---

## Context

For ChromaKnit to recolor garments realistically, we need to separate the garment from the background. Without proper segmentation, the entire image (including background, models, other objects) would be recolored, producing unusable results.

### Requirements

1. **Accurate Segmentation:** Cleanly separate garment/subject from background
2. **Ease of Use:** Simple API, minimal configuration
3. **Performance:** Reasonable processing time (<10 seconds for typical images)
4. **Quality:** Smooth edges, handles complex backgrounds
5. **Maintainability:** Well-supported library, minimal custom code

---

## Decision

**Use the `rembg` library for automatic background removal.**

```python
from rembg import remove

# Simple, one-line background removal
result = remove(image)  # Returns RGBA image
mask = result[:, :, 3]  # Alpha channel as mask
```

---

## Options Considered

### Option 1: Manual Color-Based Thresholding ❌

**Approach:** Use OpenCV color thresholding to detect background

```python
# Convert to HSV, threshold background color
hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
mask = cv2.inRange(hsv, lower_bound, upper_bound)
```

**Pros:**

- Fast execution
- No external dependencies
- Full control over algorithm

**Cons:**

- Requires manual tuning for each image
- Fails with complex/patterned backgrounds
- Doesn't work with models or varied backgrounds
- Poor edge quality
- Not generalizable

**Verdict:** ❌ Too brittle for real-world use

---

### Option 2: GrabCut Algorithm ❌

**Approach:** OpenCV's GrabCut for interactive segmentation

```python
mask = np.zeros(image.shape[:2], np.uint8)
cv2.grabCut(image, mask, rect, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_RECT)
```

**Pros:**

- Built into OpenCV
- Good quality with user input
- No external dependencies

**Cons:**

- Requires user interaction (defining rectangle)
- Not fully automatic
- Slower than needed
- Variable quality depending on initialization

**Verdict:** ❌ Not automatic enough for our use case

---

### Option 3: Custom ML Model ❌

**Approach:** Train or use a custom segmentation model (U-Net, DeepLab)

**Pros:**

- Full control over model
- Could optimize for garment-specific segmentation
- Learning opportunity

**Cons:**

- Requires significant ML expertise
- Need training data (thousands of labeled images)
- Complex infrastructure (model training, versioning, deployment)
- Months of development time
- Out of scope for Phase 1

**Verdict:** ❌ Too complex, unnecessary reinvention

---

### Option 4: rembg Library ✅ **SELECTED**

**Approach:** Use the `rembg` library with pre-trained U²-Net model

```python
from rembg import remove
result = remove(image)
mask = result[:, :, 3]  # Extract alpha channel
```

**Pros:**

- ✅ **Fully automatic** - No user input required
- ✅ **High quality** - Uses state-of-the-art U²-Net model
- ✅ **Simple API** - One function call
- ✅ **Well-maintained** - Active development on GitHub
- ✅ **Works immediately** - Pre-trained model included
- ✅ **Handles complex scenes** - People, garments, varied backgrounds
- ✅ **Good edge quality** - Smooth, natural boundaries
- ✅ **Widely used** - Battle-tested in production

**Cons:**

- Additional dependency (`rembg` + `onnxruntime`)
- ~1.5-2 second processing time (model inference)
- Model size ~180MB
- May remove more than just background (e.g., includes person wearing garment)

**Verdict:** ✅ **Best balance of quality, ease, and speed**

---

## Implementation Details

### Installation

```bash
pip install rembg onnxruntime
```

### Usage in GarmentRecolorer

```python
def remove_background(self):
    """Remove background using rembg."""
    if self.image is None:
        return False

    try:
        # Remove background (returns RGBA)
        self.image_no_bg = remove(self.image)

        # Extract alpha channel as mask
        # 255 = garment, 0 = background
        self.mask = self.image_no_bg[:, :, 3]

        return True
    except Exception as e:
        print(f"Error removing background: {e}")
        return False
```

### Mask Usage

The extracted mask is used for selective recoloring:

```python
# Only recolor pixels where mask > 0 (garment area)
recolored_hsv[self.mask > 0, 0] = new_hue
recolored_hsv[self.mask > 0, 1] = new_saturation
# Keep original V channel for texture preservation
```

---

## The HSV Breakthrough

> **Realistic coloring: HSV transformation preserves texture, shadows, and lighting**

### The Initial Problem

The first attempt at recoloring painted the entire garment a single flat color — it looked like someone had used the paint bucket tool. All texture, shadows, stitching detail, and depth were completely destroyed. The garment looked fake and unusable.

### The Insight

Think of it like an Instagram filter that changes colours but keeps the texture intact. The key breakthrough was realising that **color and brightness are independent properties** — and we only need to change the color while keeping the brightness exactly as it was.

This is what **HSV color space** enables:
- **H (Hue)** — the actual color (red, blue, green...)
- **S (Saturation)** — how vivid or washed-out the color is
- **V (Value)** — the brightness/darkness of the pixel

By converting the image to HSV, we can **replace H and S** (change the color) while **preserving V** (keep the original brightness). Since all the texture, shadows, and stitching detail live in the brightness channel, everything stays intact.

### How It Works in Practice

```python
# Convert garment image to HSV
image_hsv = cv2.cvtColor(self.image, cv2.COLOR_BGR2HSV)

# For each garment pixel (where mask > 0):
# - Replace H and S with the target color's H and S
# - Keep the original V (brightness) untouched
recolored_hsv[y, x, :2] = target_hsv_color[:2]  # Only change H and S
# V channel at index 2 stays as-is → texture preserved!
```

### Why HSV Over Other Color Spaces?

During early research, three color spaces were evaluated: **HSV**, **LAB**, and **HLS**.

| Color Space | Separates Color from Brightness? | OpenCV Support | Complexity | Verdict |
|-------------|----------------------------------|----------------|------------|---------|
| **HSV** | Yes — H and S are color, V is brightness | Native, fast `cvtColor` | Simple — swap 2 channels, keep 1 | **Selected** |
| **CIELAB** | Partially — L is lightness, but a/b are perceptual axes not hue/saturation | Native, but a* and b* don't map to intuitive "change this to red" | Would need to compute target a*/b* from a hex code, and LAB gamut mapping is non-trivial | Too complex for the gain |
| **HLS** | Yes — H is hue, L is lightness, S is saturation | Native `cvtColor` | Very similar to HSV in theory | L channel blends brightness *and* color info differently — whites and blacks both have L extremes, which can clip highlight detail when you swap H/S. HSV's V channel preserves highlight texture more cleanly |

**Why HSV wins for this use case:**
- The mental model is intuitive: "change the colour, keep the light and dark." That maps directly to replacing H+S and preserving V.
- LAB is more perceptually uniform (better for measuring color *distance*), but we're not measuring distance — we're *replacing* color. HSV makes replacement trivial.
- HLS is close, but its Lightness channel treats pure white and pure black as the same extreme (L=0 and L=1), which can cause clipping artifacts in bright highlights. HSV's Value channel is a straight brightness scale, so highlight detail survives the swap.

### Multi-Color Mapping via Brightness

A single target color would still look flat for variegated yarns. The solution maps **multiple yarn colors to the garment based on brightness zones**:

1. Sort the target yarn colors by brightness (darkest → lightest)
2. Look at each garment pixel's original brightness (V value)
3. Map dark garment pixels → dark yarn colors, light pixels → light yarn colors
4. Replace only H and S, keeping each pixel's original V

This means a 5-color yarn palette creates natural colour variation across the garment, with dark yarn tones settling into shadows and light tones hitting the highlights — just like real dyed fabric.

### The Normalization/Mapping Logic

The brightness-to-color mapping uses **min-max normalization** to evenly distribute yarn colors across the garment's brightness range:

```python
# 1. Find the brightness range of the actual garment pixels
min_b, max_b = brightness_values.min(), brightness_values.max()

# 2. Normalize each pixel's brightness to 0.0 – 1.0
normalized = (brightness_values - min_b) / (max_b - min_b)

# 3. Scale to color indices: 0 → darkest yarn color, (n-1) → lightest
color_indices = (normalized * (num_colors - 1)).astype(int)
```

**Why min-max over fixed thresholds?** The garment's actual brightness range varies wildly between images — a dark navy sweater might use V=20–80, while a white t-shirt uses V=180–250. Min-max normalization adapts to whatever range is present, ensuring all yarn colors get used regardless of the garment's overall brightness.

**Edge case — flat brightness:** If `max_b == min_b` (a perfectly uniform garment, unlikely but possible), all pixels map to color index 0 to avoid division by zero. The garment gets the darkest yarn color uniformly.

### Known Limitations of the HSV Approach

| Limitation | Why It Happens | Impact | Potential Future Fix |
|------------|---------------|--------|---------------------|
| **Colour banding** | With few yarn colors (2-3), the discrete brightness zones can create visible "steps" between color regions instead of smooth gradients | Noticeable on large smooth areas, less visible on textured knits | Blend between adjacent zones using interpolation instead of hard cutoffs |
| **Saturation override on near-white/grey areas** | Replacing S forces vivid color onto pixels that were originally desaturated (e.g., white highlights, grey shadows) | Highlights can look unnaturally vivid; grey shadows pick up color they shouldn't have | Blend target S with original S based on original saturation — low-saturation pixels should stay muted |
| **Hue wrapping at red boundary** | In OpenCV HSV, hue wraps at 180 (0° and 360° are both red). Reds near the boundary can produce unexpected jumps | Only affects red/magenta target colors — blues, greens, yellows are fine | Handle hue arithmetic with modular wrapping |
| **Single V channel carries all texture** | V encodes *both* real texture (stitch pattern, fuzz) and lighting artifacts (harsh shadows, specular highlights) — no way to distinguish them | Strong directional lighting gets "baked in" as colour variation | Pre-process with histogram equalization or use a lighting estimation model |
| **Uniform zone sizes** | The linear mapping gives equal brightness range to each yarn color, but the actual brightness distribution may be skewed (e.g., mostly dark with a few highlights) | Some yarn colors may only appear on a tiny number of pixels | Use quantile-based mapping instead of linear to give each color roughly equal pixel count |

### Result

Before HSV breakthrough: flat, single-colour paint bucket effect
After HSV breakthrough: realistic recoloring with all original texture, shadows, and stitching detail preserved

---

## Trade-offs Accepted

### 1. Processing Time

- **Trade-off:** ~1.7-1.9 seconds per image vs. instant thresholding
- **Justification:** Quality and accuracy are more important than speed for Phase 1
- **Mitigation:** Can optimize in Phase 4 with GPU acceleration, caching

### 2. Model Size

- **Trade-off:** ~180MB model vs. no model dependency
- **Justification:** One-time download, acceptable for modern systems
- **Mitigation:** Model is cached after first use

### 3. Over-Segmentation

- **Trade-off:** May include person/model with garment vs. perfect garment-only detection
- **Justification:** Still produces useful results, perfect segmentation is research-level problem
- **Mitigation:** Document as known limitation, can improve with custom models in future

### 4. Dependency Risk

- **Trade-off:** Rely on external library vs. full control
- **Justification:** Library is mature, well-maintained, widely used
- **Mitigation:** Pin version in requirements.txt, monitor for updates

### 5. Memory Footprint

- **Trade-off:** ~300-400MB memory usage when loaded vs. lightweight
- **Justification:** Required for high-quality segmentation
- **Mitigation:** Use **lazy loading** - import rembg only when recolor endpoint is called, not at server startup

```python
# Lazy import pattern (reduces startup memory from ~500MB to ~200MB)
def remove_background(self):
    from rembg import remove  # Only loads when needed
    self.image_no_bg = remove(self.image)
```

---

## Success Metrics

After implementation, we measured:

✅ **Quality:** Clean edge detection, handles complex backgrounds
✅ **Speed:** ~1.7-1.9s for full recoloring (background removal + HSV transform)
✅ **Accuracy:** Successfully segments garments in test cases
✅ **Ease of Use:** Single function call, no configuration needed
✅ **Maintenance:** Zero issues, works out of the box

**Current Benchmarks (Garment Recoloring):**
```
Image Size      Time
-------------------------
Small (300x300)   1.746s
Medium (800x800)  1.863s
Large (1920x1080) 1.766s
```
*Note: Time is nearly constant due to fixed model inference time.*

---

## Alternative Considered for Future

### Segment Anything Model (SAM) by Meta

**Potential future improvement:**

- More recent (2023), more advanced than U²-Net
- Better at segmenting specific objects
- Could provide garment-only segmentation with prompts

**Why not now:**

- More complex integration
- Requires user prompts or additional ML for automatic point selection
- Larger model size
- Beyond Phase 1 scope

**Decision:** Revisit in Phase 4 optimization if needed

---

## Consequences

### Positive

- ✅ Fast development - integrated in 1 day
- ✅ High-quality results immediately
- ✅ No ML expertise required
- ✅ Reliable, production-ready solution
- ✅ Enables realistic garment recoloring

### Negative

- ⚠️ Additional ~180MB dependency
- ⚠️ Processing time not real-time
- ⚠️ May segment more than garment (includes model)

### Neutral

- Works well for current use case
- Can be replaced/improved later if needed
- Standard approach in the industry

---

## References

- [rembg GitHub Repository](https://github.com/danielgatis/rembg)
- [U²-Net Paper](https://arxiv.org/abs/2005.09007)
- [Background Removal Comparison Study](https://arxiv.org/abs/2011.11961)

---

## Revision History

- **2025-11-14:** Initial decision - Selected rembg
- **2026-02-05:** Updated with current benchmark results
- **Future:** May revisit with SAM or custom garment segmentation model

---

**Decision Owner:** Joyce Chong  
**Review Date:** Phase 4 (Production Optimization)
