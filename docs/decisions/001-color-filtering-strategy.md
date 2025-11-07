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
