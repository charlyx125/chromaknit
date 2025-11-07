# Decision Record 001: Color Filtering Strategy

## Status
🟡 **Postponed** - Awaiting Phase 2 garment recoloring data

## Date
2025-11-07

## Context

### The Problem

Close-up yarn photos contain pixels that may not represent how the yarn appears in a finished garment when viewed from a distance:

- **Dark shadows** between knots in the yarn texture
- **Gaps** in the yarn structure  
- **Lighting artifacts** from photography
- **Background bleed** if yarn isn't properly isolated

These are currently extracted as "dominant" colors but may create unrealistic garment visualizations.

### Example

Testing on blue variegated yarn produced:
1. `#6b9bd1` - Light blue (45%) ✓ Legitimate yarn color
2. `#4a7ba9` - Medium blue (23%) ✓ Legitimate yarn color
3. `#355a7f` - Dark blue (15%) ⚠️ Could be shadow or actual color
4. `#2e2e2e` - Near-black (10%) ✗ Likely lighting artifact
5. `#8fb5d8` - Pale blue (7%) ✓ Legitimate yarn color

### The Core Question

**Should we filter out very dark/desaturated colors, or are they needed for realistic garment recoloring?**

### Why This Matters

**The distance perception problem:**
- Yarn photos are taken at 3 inches (close-up)
- Garments are viewed from 3 feet (distance)
- Human perception: colors optically blend differently at different scales
- Shadows that are distinct up close merge with fiber color from distance

---

## Options Considered

### Option 1: No Filtering (Keep All Colors)

**Approach:** Extract all 5 colors using K-means, use all for garment recoloring.

**Pros:**
- ✅ Simplest implementation (no additional logic)
- ✅ No information loss
- ✅ Works for intentionally dark yarns (navy, charcoal, black)
- ✅ No risk of incorrectly filtering legitimate colors

**Cons:**
- ❌ Includes artifact colors (shadows, gaps, lighting)
- ❌ May make recolored garments too dark/muddy
- ❌ Doesn't match human distance perception
- ❌ Could misrepresent yarn's actual appearance

**When this works best:**
- Very dark yarns where all colors are legitimately dark
- Ombre/gradient yarns that transition to black
- High-contrast yarns (black and white)

---

### Option 2: HSV-Based Filtering

**Approach:** Convert extracted colors to HSV space and filter out:
- **Value (V) < 30%** - Very dark colors
- **Saturation (S) < 20%** - Very desaturated colors (greys)

**Pros:**
- ✅ Targets likely artifacts using color theory
- ✅ Focuses on actual fiber colors
- ✅ More realistic for distance viewing
- ✅ Configurable thresholds can be tuned

**Cons:**
- ❌ Might remove legitimate dark colors (navy, charcoal)
- ❌ Adds implementation complexity
- ❌ Requires threshold tuning per yarn type
- ❌ Could filter out black in intentionally dark yarns

**When this works best:**
- Light to medium colored yarns
- Variegated yarns with clear color sections
- When artifacts are obvious (very dark outliers)

**Implementation note:**
```python
Convert RGB to HSV
hsv_color = cv2.cvtColor(rgb_color, cv2.COLOR_RGB2HSV)
h, s, v = hsv_colorFilter criteria
is_artifact = (v < 0.30) or (s < 0.20)
# Decision Record 001: Color Filtering Strategy

## Status
🟡 **Postponed** - Awaiting Phase 2 garment recoloring data

## Date
2025-11-07

## Context

### The Problem

Close-up yarn photos contain pixels that may not represent how the yarn appears in a finished garment when viewed from a distance:

- **Dark shadows** between knots in the yarn texture
- **Gaps** in the yarn structure  
- **Lighting artifacts** from photography
- **Background bleed** if yarn isn't properly isolated

These are currently extracted as "dominant" colors but may create unrealistic garment visualizations.

### Example

Testing on blue variegated yarn produced:
1. `#6b9bd1` - Light blue (45%) ✓ Legitimate yarn color
2. `#4a7ba9` - Medium blue (23%) ✓ Legitimate yarn color
3. `#355a7f` - Dark blue (15%) ⚠️ Could be shadow or actual color
4. `#2e2e2e` - Near-black (10%) ✗ Likely lighting artifact
5. `#8fb5d8` - Pale blue (7%) ✓ Legitimate yarn color

### The Core Question

**Should we filter out very dark/desaturated colors, or are they needed for realistic garment recoloring?**

### Why This Matters

**The distance perception problem:**
- Yarn photos are taken at 3 inches (close-up)
- Garments are viewed from 3 feet (distance)
- Human perception: colors optically blend differently at different scales
- Shadows that are distinct up close merge with fiber color from distance

---

## Options Considered

### Option 1: No Filtering (Keep All Colors)

**Approach:** Extract all 5 colors using K-means, use all for garment recoloring.

**Pros:**
- ✅ Simplest implementation (no additional logic)
- ✅ No information loss
- ✅ Works for intentionally dark yarns (navy, charcoal, black)
- ✅ No risk of incorrectly filtering legitimate colors

**Cons:**
- ❌ Includes artifact colors (shadows, gaps, lighting)
- ❌ May make recolored garments too dark/muddy
- ❌ Doesn't match human distance perception
- ❌ Could misrepresent yarn's actual appearance

**When this works best:**
- Very dark yarns where all colors are legitimately dark
- Ombre/gradient yarns that transition to black
- High-contrast yarns (black and white)

---

### Option 2: HSV-Based Filtering

**Approach:** Convert extracted colors to HSV space and filter out:
- **Value (V) < 30%** - Very dark colors
- **Saturation (S) < 20%** - Very desaturated colors (greys)

**Pros:**
- ✅ Targets likely artifacts using color theory
- ✅ Focuses on actual fiber colors
- ✅ More realistic for distance viewing
- ✅ Configurable thresholds can be tuned

**Cons:**
- ❌ Might remove legitimate dark colors (navy, charcoal)
- ❌ Adds implementation complexity
- ❌ Requires threshold tuning per yarn type
- ❌ Could filter out black in intentionally dark yarns

**When this works best:**
- Light to medium colored yarns
- Variegated yarns with clear color sections
- When artifacts are obvious (very dark outliers)

**Implementation note:**
```python
# Convert RGB to HSV
hsv_color = cv2.cvtColor(rgb_color, cv2.COLOR_RGB2HSV)
h, s, v = hsv_color

# Filter criteria
is_artifact = (v < 0.30) or (s < 0.20)
```

---

### Option 3: Brightness Threshold (Pre-filtering)

**Approach:** Ignore pixels below brightness threshold DURING extraction (before K-means).

**Pros:**
- ✅ Prevents artifacts from being extracted at all
- ✅ Cleaner initial data for clustering
- ✅ Focuses on lit areas of yarn

**Cons:**
- ❌ Hard to determine universal threshold
- ❌ Different lighting conditions need different thresholds
- ❌ Could miss legitimate dark areas in well-lit photos
- ❌ Removes data before analysis (can't undo)

**When this works best:**
- Consistently lit product photos
- When you control photography conditions
- Stock images with professional lighting

---

### Option 4: User Selection (UI-Based)

**Approach:** Extract all 5 colors, display them to user, allow deselection of unwanted colors.

**Pros:**
- ✅ Most flexible - works for all yarn types
- ✅ User knows their yarn best
- ✅ Educational - user sees the extraction process
- ✅ No false positives (removing legitimate colors)
- ✅ Handles edge cases automatically

**Cons:**
- ❌ Requires UI development (delays automation)
- ❌ Adds friction to user workflow
- ❌ Not fully automated
- ❌ Requires user to understand which colors are artifacts

**When this works best:**
- As a long-term solution after MVP
- When building web interface (Phase 4)
- For power users who want control

**UI mockup:**
```
Extracted Colors:
[✓] #6b9bd1 (45%)  
[✓] #4a7ba9 (23%)
[✓] #8fb5d8 (15%)
[✗] #2e2e2e (10%)  ← User deselected (artifact)
[✓] #355a7f (7%)
```

---

### Option 5: Hybrid Approach

**Approach:** Apply HSV filtering by default, but provide "Include dark colors" toggle.

**Pros:**
- ✅ Good defaults for 80% of cases
- ✅ Override available when needed
- ✅ Best of both worlds
- ✅ Teaches user about the issue

**Cons:**
- ❌ Most complex to implement
- ❌ Still need to decide default behavior
- ❌ Requires UI (can't implement in Phase 1)

---

## Decision

### **Status: Postponed until Phase 2**

**Rationale:**

1. **Cannot validate effectiveness without garment recoloring**
   - Don't know if dark colors actually make garments look muddy
   - Need visual comparison: filtered vs. unfiltered on real garments
   - Hypothesis needs testing, not assumptions

2. **Insufficient data for informed decision**
   - Only tested on one yarn type so far
   - Different yarn types may behave differently
   - Need more examples to see patterns

3. **Risk of premature optimization**
   - Better to gather data than make wrong decision early
   - Can iterate once we understand the actual impact
   - Easier to add filtering later than remove it incorrectly

4. **Garment photos have their own shading**
   - Hypothesis: Garment's texture/shadows are separate from yarn color
   - If true, we only need "true" yarn colors
   - If false, we need to preserve dark tones
   - Can't know until we test garment recoloring

**Current approach:** Proceed with Option 1 (no filtering) for Phase 2 testing.

---

## Testing Plan (Phase 2)

When implementing garment recoloring:

### Test Setup
1. Select 3 yarn photos: solid, variegated, ombre
2. Extract colors using current algorithm (unfiltered)
3. Create filtered version using Option 2 (HSV filtering)
4. Select 2-3 garment photos with different styles

### Test Execution
For each yarn + garment combination:
1. Recolor garment using **unfiltered colors** → Result A
2. Recolor garment using **filtered colors** → Result B
3. Save both results side-by-side

### Evaluation Criteria
- Visual realism (which looks more like actual yarn?)
- Color accuracy (does it match yarn appearance from distance?)
- Texture preservation (are shadows/highlights natural?)
- User preference (informal feedback)

### Decision Triggers
- **If filtered looks consistently better** → Implement Option 2 (HSV filtering)
- **If results are mixed** → Implement Option 5 (Hybrid with toggle)
- **If unfiltered looks better** → Keep Option 1 (no filtering)

---

## Consequences

### Short-term (Phase 1)
- ✅ Color extraction proceeds without blocking
- ⚠️ Extracted colors may include artifacts
- ⚠️ Need to document which colors appear artificial in testing
- ✅ No premature optimization

### Medium-term (Phase 2)
- ⚠️ May need to refactor if filtering is required
- ✅ Will have data to make informed decision
- ✅ Can A/B test approaches
- ⚠️ Garment recoloring might look too dark (acceptable risk)

### Long-term (Phase 3-4)
- ✅ Likely implement Option 4 or 5 (user control)
- ✅ Default filtering with override gives best UX
- ✅ Different strategies for different yarn types possible
- ✅ Machine learning could eventually auto-detect artifacts

---

## Related Issues

- **Challenge 2:** Background Removal (Decision 002)
- **Phase 2:** Garment Recoloring implementation
- **Future:** Yarn type detection (solid vs. variegated vs. ombre)

---

## References

### Color Theory
- Simultaneous contrast in color perception
- Optical color mixing at distance (pointillism effect)
- HSV color space for perceptual filtering

### Computer Vision
- Color quantization using K-means
- Image segmentation techniques
- Color space conversions (RGB, HSV, LAB)

### Related Documentation
- [Development Log - Challenge #1](../development-log.md#challenge-1-the-close-up-vs-distance-problem)
- [Phase 1 Implementation](../development-log.md#phase-1-color-extraction)

---

## History

- **2025-11-07:** Initial analysis, decision to postpone
- **[Future]:** Phase 2 testing results
- **[Future]:** Final decision implementation

---

## Notes

**Key insight:** This is a good example of when NOT to make a decision. Sometimes the best decision is to acknowledge uncertainty and wait for more data. Premature optimization based on assumptions could lead to wrong implementation.

**For future reference:** When similar decisions arise, ask:
1. Can we test this hypothesis?
2. What data do we need?
3. What's the cost of being wrong?
4. Can we defer safely?
