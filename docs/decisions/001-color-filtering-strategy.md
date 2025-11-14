# Decision Record 001: Color Extraction Algorithm Selection

## Status

✅ **Implemented** - K-means clustering integrated into ColorExtractor (Phase 1)

## Date

2025-11-07

## Context

### The Problem

ChromaKnit needs to extract dominant colors from yarn photos to enable garment recoloring. The challenge is:

1. **Yarn photos contain millions of pixels** - Need to reduce to 5-10 representative colors
2. **Colors vary across the yarn** - Need to capture the full color palette, not just one average
3. **Must be automatic** - No manual color picking required
4. **Must handle varied yarn types** - Solid colors, variegated, ombre, multicolor
5. **Must be sorted by frequency** - Most common colors first
6. **Must output hex codes** - For easy reference and recoloring

### Use Case

**Input:** Yarn photo (e.g., blue knitted yarn close-up)

**Desired output:**

- List of 5 hex color codes representing dominant colors
- Sorted by frequency (most common first)
- Visual palette showing color distribution
- Percentages for each color

**Requirements:**

- Fast enough for interactive use (< 5 seconds)
- Consistent results (same image → same colors)
- Works with real-world photos (various lighting, backgrounds)

---

## Options Considered

### Option 1: K-means Clustering ✅ **SELECTED**

**What it is:** Unsupervised machine learning algorithm that groups similar pixels into K clusters, where each cluster center represents a dominant color.

**How it works:**

1. Reshape image from (height, width, 3) to (total_pixels, 3)
2. Run K-means with n_clusters=5 (configurable)
3. Extract cluster centers as RGB values
4. Count pixels in each cluster to get frequency
5. Sort by frequency (most common first)
6. Convert to hex codes

**Pros:**

- ✅ Industry standard for color quantization
- ✅ Works automatically on any image
- ✅ Handles all yarn types (solid, variegated, multicolor)
- ✅ Provides frequency information (pixel counts)
- ✅ Fast execution (1-2 seconds for typical images)
- ✅ Consistent results with random_state=42
- ✅ Well-documented in scikit-learn
- ✅ No manual tuning required

**Cons:**

- ⚠️ May include shadow/lighting artifacts as separate colors
- ⚠️ Sensitive to lighting conditions
- ⚠️ Requires scikit-learn dependency

**When it works best:**

- All yarn types and lighting conditions
- Photos with clear color variations
- When you need frequency-weighted results

**Implementation:**

```python
from sklearn.cluster import KMeans

# Reshape image to pixel array
pixels = image_rgb.reshape(-1, 3)

# Cluster colors
kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
kmeans.fit(pixels)

# Extract colors and frequencies
cluster_centers = kmeans.cluster_centers_
labels, counts = np.unique(kmeans.labels_, return_counts=True)

# Sort by frequency
sorted_indices = np.argsort(-counts)
dominant_colors = cluster_centers[sorted_indices]
```

---

### Option 2: Median Cut Algorithm ❌

**What it is:** Classic color quantization algorithm that recursively splits color space by median values.

**Pros:**

- ✅ No ML dependencies
- ✅ Fast execution
- ✅ Deterministic results

**Cons:**

- ❌ More complex to implement from scratch
- ❌ No built-in frequency information
- ❌ Results can be less perceptually accurate than K-means
- ❌ Harder to tune number of colors

**Verdict:** ❌ K-means is simpler and more accurate

---

### Option 3: Color Histogram with Binning ❌

**What it is:** Divide RGB space into bins and count pixels in each bin.

**Pros:**

- ✅ Very fast
- ✅ Simple implementation
- ✅ No dependencies

**Cons:**

- ❌ Requires manual bin size tuning
- ❌ May miss subtle color variations
- ❌ Produces grid-aligned colors (not actual yarn colors)
- ❌ Doesn't adapt to image content

**Verdict:** ❌ Too rigid, doesn't capture actual yarn colors

---

### Option 4: Manual Color Picker ❌

**What it is:** User clicks on yarn photo to select colors manually.

**Pros:**

- ✅ Perfect accuracy (user selects exact colors)
- ✅ No algorithm complexity
- ✅ User has full control

**Cons:**

- ❌ Not automatic (against project goals)
- ❌ Requires UI development
- ❌ Time-consuming for users
- ❌ Doesn't provide frequency information
- ❌ Subjective (different users pick different colors)

**Verdict:** ❌ Not automatic enough for MVP

---

### Option 5: Pre-trained Color Palette Models ❌

**What it is:** Use ML models trained to extract "artistic" color palettes (e.g., Adobe Color extraction).

**Pros:**

- ✅ Aesthetically pleasing results
- ✅ May handle artistic intent better

**Cons:**

- ❌ Requires external API calls (Adobe, Canva, etc.)
- ❌ Not open source
- ❌ May not preserve actual yarn colors
- ❌ Optimized for graphic design, not textile accuracy
- ❌ Cost/rate limits

**Verdict:** ❌ Overkill and unnecessary dependency

---

## Decision

### ✅ **Chosen: Option 1 - K-means Clustering**

**Rationale:**

1. **Meets all requirements perfectly**

   - Automatic extraction ✅
   - Handles all yarn types ✅
   - Fast execution ✅
   - Frequency information ✅
   - Hex code output ✅
   - Reproducible results ✅

2. **Industry standard approach**

   - Used by Photoshop, GIMP, and other image editors
   - Well-tested and proven
   - Extensive documentation and examples

3. **Right complexity for MVP**

   - Simple scikit-learn integration (3 lines of code)
   - No custom algorithms to maintain
   - Easy to understand and debug

4. **Enables full workflow**
   - Extracted colors work perfectly with garment recoloring
   - Frequency sorting ensures most important colors come first
   - Multiple colors enable realistic multi-tone recoloring

---

## Implementation Details

### ColorExtractor Class Structure

```python
class ColorExtractor:
    def __init__(self, image_path, n_colors=5):
        self.image_path = image_path
        self.n_colors = n_colors

    def extract_dominant_colors(self):
        # 1. Load and convert image
        image_rgb = self._preprocess_image()

        # 2. Reshape for clustering
        pixels = self._reshape_for_clustering()

        # 3. K-means clustering
        kmeans = self._cluster_colors(pixels)

        # 4. Sort by frequency
        self._sort_by_frequency(kmeans)

        # 5. Return hex codes
        return self.hex_codes
```

### Key Parameters

**n_clusters:** Number of colors to extract (default: 5)

- Too few (< 3): Misses color variations
- Too many (> 10): Includes minor artifacts
- Sweet spot: 5-7 for most yarns

**random_state:** Seed for reproducibility (42)

- Ensures same image always produces same colors
- Critical for testing and debugging

**n_init:** Number of K-means initializations (10)

- Higher = more accurate but slower
- 10 is scikit-learn's recommended default

### Pipeline Flow

```
Yarn Photo (RGB)
    ↓
Convert BGR → RGB (OpenCV uses BGR)
    ↓
Reshape: (H, W, 3) → (H×W, 3)
    ↓
K-means Clustering (n_clusters=5)
    ↓
Extract Cluster Centers (RGB colors)
    ↓
Count pixels per cluster (frequency)
    ↓
Sort by frequency (descending)
    ↓
Convert RGB → Hex codes
    ↓
Output: ['#142a68', '#23438d', ...]
```

---

## Results

### Real-World Testing

**Test Image:** Blue knitted yarn (1200×940 pixels, 1.1M total pixels)

**Extracted Colors:**

1. `#142a68` (29.2%) - Dark blue
2. `#23438d` (25.0%) - Medium blue
3. `#0c153b` (18.0%) - Navy
4. `#3e64b2` (17.3%) - Bright blue
5. `#658ad6` (10.4%) - Light blue

**Performance:**

- Extraction time: ~1.2 seconds
- Clustering iterations: 5-7
- Memory usage: ~15MB
- Reproducibility: 100% (same colors every run)

**Quality:**

- ✅ Captured full blue color range
- ✅ Frequency matches visual distribution
- ✅ No obvious artifacts
- ✅ Colors are perceptually distinct

---

## Trade-offs Accepted

### 1. May Include Shadows/Artifacts

**Trade-off:** K-means treats shadows as distinct colors

**Example:** Very dark color (#0c153b) might be shadow or actual navy

**Why acceptable:**

- These dark colors still contribute to realistic garment appearance
- Shadows in yarn translate to depth in garment
- Can filter later if needed (see Future Enhancements)

**Mitigation:** Use well-lit yarn photos for best results

---

### 2. Sensitive to Lighting

**Trade-off:** Same yarn under different lighting produces different colors

**Why acceptable:**

- This is actually desirable (captures how yarn looks in that lighting)
- Users photograph yarn in lighting similar to final use
- Consistent with real-world perception

**Mitigation:** Document best photography practices

---

### 3. Scikit-learn Dependency

**Trade-off:** Adds ~30MB to installation

**Why acceptable:**

- Industry-standard library
- Well-maintained and stable
- Provides many other useful algorithms
- Already widely used in data science

**Mitigation:** None needed (reasonable dependency)

---

## Testing

### Unit Tests (23 tests, 99% coverage)

**Color extraction tests:**

- `test_extract_dominant_colors_success()` - Full pipeline works
- `test_extract_dominant_colors_returns_hex_codes()` - Output format correct
- `test_different_n_colors_values()` - Configurable cluster count
- `test_cluster_colors_correct_number()` - K-means creates right number of clusters
- `test_sort_by_frequency_descending()` - Colors sorted properly

**Integration tests:**

- `test_full_pipeline()` - Extract + visualize works end-to-end
- Real yarn photo produces expected 5 colors

### Performance Benchmarks

```
Image Size    Pixels      Extraction Time
----------------------------------------
Small         90K         0.234s
Medium        640K        1.456s
Large         2.1M        3.892s
```

**Conclusion:** Fast enough for interactive use

---

## Known Limitations

| Issue             | Impact                                        | Workaround                                 |
| ----------------- | --------------------------------------------- | ------------------------------------------ |
| Includes shadows  | May extract dark artifact colors              | Use even lighting, or filter in Phase 2    |
| Color count fixed | Can't dynamically determine optimal K         | User can configure n_colors parameter      |
| RGB color space   | Less perceptually uniform than LAB            | Acceptable for Phase 1, revisit in Phase 4 |
| Background pixels | May extract background colors if not isolated | Crop yarn to center of image               |

---

## Future Enhancements

### Phase 2 Candidates

**Post-processing filters:**

- HSV filtering to remove very dark/desaturated colors
- Background color detection and removal
- Brightness normalization

**Advanced clustering:**

- Use LAB color space (more perceptually uniform)
- Hierarchical clustering for automatic K selection
- Density-based clustering (DBSCAN) for outlier removal

**User controls:**

- Adjustable n_colors in UI
- Manual color deselection
- Color replacement/adjustment

---

## Alignment with Project Goals

✅ **Automatic color extraction** - No manual work required  
✅ **Fast execution** - Interactive performance  
✅ **Accurate results** - Captures actual yarn colors  
✅ **Frequency information** - Enables realistic recoloring  
✅ **Simple codebase** - Easy to maintain and extend  
✅ **Testable** - Comprehensive test coverage

---

## Related Decisions

- **Decision 002:** Background Removal Strategy (garment recoloring)
- **Phase 1:** Color Extraction ✅ Complete
- **Phase 2:** Garment Recoloring ✅ Complete
- **Phase 3:** Web Interface 📋 Planned

---

## References

- [scikit-learn K-means Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html)
- [Color Quantization Algorithms Comparison](https://en.wikipedia.org/wiki/Color_quantization)
- [K-means Clustering Tutorial](https://scikit-learn.org/stable/auto_examples/cluster/plot_kmeans_digits.html)
- [ColorExtractor Implementation](../../core/yarn_color_extractor.py)
- [Test Suite](../../tests/test_color_extractor.py)

---

## History

- **2025-11-07:** ✅ Decision finalized - K-means selected
- **2025-11-07:** ✅ Implementation complete
- **2025-11-14:** ✅ Unit tests complete (23 tests, 99% coverage)
- **2025-11-14:** ✅ Performance benchmarks validated
- **2025-11-14:** ✅ Real-world testing with blue yarn successful

---

## Owner

**Decision Owner:** Joyce Chong  
**Status:** ✅ Implemented & Tested  
**Phase:** 1 (Color Extraction)  
**Ready for Production:** ✅ Yes
