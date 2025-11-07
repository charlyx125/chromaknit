# Decision Record 002: Background Removal Strategy

## Status
📋 **Planned** - Deferred to Phase 1.5

## Date
2025-11-07

## Context

### The Problem

Yarn photos often include non-yarn elements that affect color extraction accuracy:

- **Background surfaces** (tables, fabric, paper)
- **Hands** holding the yarn
- **Photography equipment** shadows
- **Product packaging** visible in frame
- **Other objects** in the scene

These elements contribute pixels to the K-means clustering, which can:
- Introduce unwanted colors to the palette
- Dilute the frequency of actual yarn colors
- Reduce accuracy of dominant color ranking

### Example Scenarios

**Scenario A: Clean product photo**
- Professional stock image
- Plain white or neutral background
- Yarn fills most of frame
- Minimal impact on extraction

**Scenario B: User-taken photo**
- Yarn on wooden table → brown pixels extracted
- Hand holding yarn → skin tone pixels extracted
- Shadow from window → dark grey pixels extracted
- Background clutter → random color contamination

### Impact on Color Extraction

Current algorithm with background:
```
Colors extracted:
1. #8B7355 (32%) ← Wooden table background
2. #6b9bd1 (28%) ← Actual yarn color
3. #4a7ba9 (18%) ← Actual yarn color
4. #2e2e2e (12%) ← Shadow
5. #FFC9A8 (10%) ← Hand/skin tone
```

Same yarn, clean extraction:
```
Colors extracted:
1. #6b9bd1 (45%) ← Actual yarn color
2. #4a7ba9 (23%) ← Actual yarn color
3. #8fb5d8 (15%) ← Actual yarn color
4. #355a7f (10%) ← Actual yarn color
5. #9ac4e3 (7%)  ← Actual yarn color
```

---

## Options Considered

### Option 1: Manual Pre-Cropping (Current Workaround)

**Approach:** Require users to crop photos before upload, showing only yarn.

**Pros:**
- ✅ Zero implementation effort
- ✅ User has full control
- ✅ Works immediately
- ✅ No dependencies on ML models

**Cons:**
- ❌ Poor user experience (extra step)
- ❌ Requires photo editing skills
- ❌ Mobile users may struggle
- ❌ Inconsistent results (user skill-dependent)
- ❌ Friction reduces adoption

**Current status:** Using this for Phase 1 testing.

---

### Option 2: Rembg Library (Automatic Background Removal)

**Approach:** Use Rembg (Remove Background) library with pre-trained U²-Net model.

**Pros:**
- ✅ Fully automatic (no user action needed)
- ✅ Fast inference (~2-3 seconds)
- ✅ Works well on common objects
- ✅ Open source and actively maintained
- ✅ Simple API: `rembg.remove(image)`

**Cons:**
- ⚠️ Adds 176MB model dependency
- ⚠️ May struggle with yarn (thin, irregular shapes)
- ⚠️ Could remove yarn parts (false positives)
- ⚠️ Requires GPU for fast processing (optional)
- ❌ Not specifically trained on yarn/textiles

**Implementation:**
```python
from rembg import remove
from PIL import Image

# Remove background
input_image = Image.open('yarn_photo.jpg')
output_image = remove(input_image)

# Extract colors from foreground only
mask = output_image.split()[-1]  # Alpha channel
yarn_only = apply_mask(input_image, mask)
```

**When this works best:**
- Clear subject-background separation
- Yarn against contrasting background
- Standard product photography

---

### Option 3: Segment Anything Model (SAM)

**Approach:** Use Meta's SAM for interactive or automatic segmentation.

**Pros:**
- ✅ State-of-the-art segmentation quality
- ✅ Can handle complex scenes
- ✅ Interactive mode (user clicks yarn)
- ✅ Automatic mode with prompts
- ✅ Better at handling irregular shapes

**Cons:**
- ❌ Much larger model (2.4GB)
- ❌ Slower inference (~5-10 seconds)
- ❌ Requires more computational resources
- ❌ More complex integration
- ❌ Overkill for this use case

**When this works best:**
- Complex backgrounds with multiple objects
- When precision is critical
- Interactive segmentation UI

---

### Option 4: Color-Based Background Detection

**Approach:** Assume background is relatively uniform, detect and remove it algorithmically.

**Pros:**
- ✅ No ML dependencies
- ✅ Fast and lightweight
- ✅ Works for simple backgrounds

**Cons:**
- ❌ Fails with complex backgrounds
- ❌ Fails when background similar to yarn color
- ❌ Requires parameter tuning
- ❌ Fragile solution

**Algorithm:**
```python
# Find most common edge color (likely background)
edge_pixels = np.concatenate([
    image[0, :],    # Top edge
    image[-1, :],   # Bottom edge
    image[:, 0],    # Left edge
    image[:, -1]    # Right edge
])

background_color = mode(edge_pixels)
mask = color_distance(image, background_color) > threshold
```

---

### Option 5: User-Guided Selection

**Approach:** Simple UI where user clicks/drags to select yarn region.

**Pros:**
- ✅ Perfect accuracy (user knows what's yarn)
- ✅ Works for all cases
- ✅ Educational (user understands process)
- ✅ No ML dependencies

**Cons:**
- ❌ Requires UI development
- ❌ Poor mobile UX (precise selection hard)
- ❌ Adds friction to workflow
- ❌ Not fully automated

**UI mockup:**
```
┌─────────────────────────────┐
│  [Photo with yarn]          │
│                             │
│  Click and drag to select   │
│  the yarn area             │
│                             │
│  [Reset] [Confirm]          │
└─────────────────────────────┘
```

---

### Option 6: Hybrid Approach

**Approach:** 
1. Try automatic removal (Rembg)
2. If confidence low, ask user to verify/adjust
3. Allow manual override

**Pros:**
- ✅ Best of both worlds
- ✅ Automatic for easy cases
- ✅ Fallback for complex cases
- ✅ User control when needed

**Cons:**
- ❌ Most complex to implement
- ❌ Requires confidence scoring
- ❌ UI for both automatic and manual modes

---

## Decision

### **Status: Deferred to Phase 1.5**

**Timing:** After Phase 1 color extraction works, before Phase 2 garment recoloring.

**Chosen approach:** **Option 2 (Rembg) with Option 1 (Manual crop) as fallback**

**Rationale:**

1. **Not blocking Phase 1**
   - Color extraction algorithm works with clean photos
   - Can test with manually cropped images
   - Don't need perfect solution immediately

2. **Rembg is good enough**
   - Automatic = better UX
   - Fast enough for MVP
   - Model size acceptable for local use
   - Works well enough on textiles (needs testing)

3. **Can upgrade later if needed**
   - Start with Rembg
   - If quality insufficient, try SAM
   - If automation fails, add manual UI
   - Iterative approach reduces risk

4. **Prioritization**
   - Phase 2 (garment recoloring) is higher priority
   - Background removal is "nice to have" not "must have"
   - Can launch MVP with manual cropping

**Implementation plan:**
- Phase 1: Manual cropping (current)
- Phase 1.5: Add Rembg
- Phase 3: Add manual selection UI if needed
- Phase 4: Consider SAM if quality issues persist

---

## Implementation Details

### Phase 1.5 Integration
```python
def load_and_segment_yarn(image_path):
    """
    Load yarn image and remove background.
    
    Returns:
        yarn_only: Image with background removed
        confidence: Float indicating segmentation quality
    """
    try:
        # Load image
        image = Image.open(image_path)
        
        # Remove background
        output = remove(image)
        
        # Check if segmentation looks good
        mask = np.array(output.split()[-1])
        confidence = calculate_confidence(mask)
        
        if confidence < 0.7:
            print("Warning: Background removal may be imperfect")
            print("Consider manually cropping the image")
        
        return output, confidence
        
    except Exception as e:
        print(f"Background removal failed: {e}")
        print("Falling back to full image")
        return image, 0.0
```

### Confidence Calculation
```python
def calculate_confidence(mask):
    """
    Estimate segmentation quality.
    
    Good segmentation:
    - Clear subject (continuous region)
    - Clean edges (not too jagged)
    - Reasonable size (not too small/large)
    """
    # Foreground percentage
    fg_ratio = np.sum(mask > 128) / mask.size
    
    # Check if reasonable (20-80% of image)
    if fg_ratio < 0.2 or fg_ratio > 0.8:
        return 0.5  # Suspicious
    
    # Edge smoothness (simple metric)
    edges = cv2.Canny(mask, 50, 150)
    edge_ratio = np.sum(edges > 0) / mask.size
    
    if edge_ratio > 0.3:  # Too jagged
        return 0.6
    
    return 0.9  # Looks good
```

---

## Testing Plan

### Phase 1.5 Testing

**Test images needed:**
1. Clean product photos (should work well)
2. Yarn on wooden table (test common case)
3. Hand holding yarn (test skin tone removal)
4. Complex background (test failure mode)
5. Yarn similar to background color (edge case)

**Success criteria:**
- 80%+ of test images have confidence > 0.7
- Extracted colors don't include obvious background colors
- Yarn colors match manual cropping results

**Fallback plan:**
- If Rembg quality insufficient (< 80% success rate)
- Implement Option 5 (user-guided selection) instead
- Re-evaluate SAM for Phase 3

---

## Consequences

### Short-term (Phase 1)
- ✅ No blocking - can proceed with manual cropping
- ✅ Documentation explains need for clean photos
- ⚠️ User experience suboptimal but acceptable for MVP

### Medium-term (Phase 1.5)
- ✅ Automatic background removal improves UX significantly
- ⚠️ Model size adds 176MB to dependencies
- ⚠️ May need fallback for edge cases
- ✅ Testing will validate approach

### Long-term (Phase 3-4)
- ✅ Can add manual selection UI for power users
- ✅ Hybrid approach offers best flexibility
- ✅ Foundation for future improvements (SAM, custom training)

---

## Related Issues

- **Decision 001:** Color Filtering Strategy
- **Phase 1:** Color Extraction (current implementation)
- **Phase 2:** Garment Recoloring
- **Future:** Mobile app (camera integration, real-time preview)

---

## References

### Libraries
- [Rembg](https://github.com/danielgatis/rembg) - Background removal library
- [Segment Anything (SAM)](https://segment-anything.com/) - Meta's segmentation model
- [U²-Net](https://github.com/xuebinqin/U-2-Net) - Underlying model for Rembg

### Related Work
- Background removal in e-commerce product photography
- Textile segmentation research
- Object detection in cluttered scenes

### Documentation
- [Development Log](../development-log.md)
- [Phase 1 Implementation](../development-log.md#phase-1-color-extraction)

---

## History

- **2025-11-07:** Issue identified, deferred to Phase 1.5
- **[Future]:** Rembg implementation and testing
- **[Future]:** Decision on whether to add manual selection UI

---

## Notes

**Current workaround:** Request users to:
1. Take photos against plain backgrounds
2. Ensure yarn fills most of frame
3. Manually crop if background visible

**Documentation needed:**
- Add "Photo tips" section to README
- Show examples of good vs. bad yarn photos
- Explain why background matters

**Future consideration:**
- Could train custom model on yarn/textile images
- Would improve accuracy but requires labeled dataset
- Defer until proven need (after Rembg testing)
