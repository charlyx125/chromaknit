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
- ✅ **Well-maintained** - Active development, 14k+ stars on GitHub
- ✅ **Works immediately** - Pre-trained model included
- ✅ **Handles complex scenes** - People, garments, varied backgrounds
- ✅ **Good edge quality** - Smooth, natural boundaries
- ✅ **Widely used** - Battle-tested in production

**Cons:**

- Additional dependency (`rembg` + `onnxruntime`)
- ~5-10 second processing time for large images
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

## Trade-offs Accepted

### 1. Processing Time

- **Trade-off:** 5-10 seconds per image vs. instant thresholding
- **Justification:** Quality and accuracy are more important than speed for Phase 1
- **Mitigation:** Can optimize in Phase 4 with caching, async processing

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

---

## Success Metrics

After implementation, we measured:

✅ **Quality:** Clean edge detection, handles complex backgrounds  
✅ **Speed:** 5-8 seconds average on 1920×1080 images (acceptable)  
✅ **Accuracy:** Successfully segments garments in 90%+ of test cases  
✅ **Ease of Use:** Single function call, no configuration needed  
✅ **Maintenance:** Zero issues, works out of the box

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
- **Future:** May revisit with SAM or custom garment segmentation model

---

**Decision Owner:** Joyce Chong  
**Review Date:** Phase 4 (Production Optimization)
