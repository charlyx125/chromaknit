# ADR 005: Performance Optimization Strategy

**Date:** February 2026
**Status:** Analysis Complete, Optimizations Planned
**Author:** Joyce Chong
**Phase:** Post-Phase 3 Analysis

---

## Context

After completing the core functionality (Phases 1-3), comprehensive benchmarks were conducted to measure the full end-to-end workflow performance. This ADR documents the findings, identifies bottlenecks, and outlines optimization strategies for future phases.

**Workflow under analysis:**

1. Color extraction from yarn image (K-means clustering)
2. Background removal from garment image (rembg/U²-Net)
3. Garment recoloring with extracted colors (HSV transformation)

**Goal:** Identify performance bottlenecks and plan optimizations that balance speed, accuracy, and implementation complexity.

---

## Business Impact

**Current state:**
- Users wait 9+ seconds for large images
- 80% of processing time spent on color extraction alone
- Poor UX for time-sensitive workflows (e.g., fashion designers iterating on colorways)

**Target state:**
- Sub-5 second total workflow for all image sizes
- Responsive, interactive experience
- Production-ready performance

**Why now?**
- MVP is complete and working (Phases 1-3 done)
- We have baseline benchmarks to measure against
- Optimization needed before deploying to production

---

## Current Performance Numbers

### Full Workflow Benchmark Results

**Test Environment:**
- Machine: LG GRAM laptop
- Test Date: February 2026
- Python: 3.11+
- Methodology: Synthetic test images, timed operations with psutil memory tracking

| Image Size | Extraction | Bg Removal | Recolor | **Total** | Peak Memory |
|------------|------------|------------|---------|-----------|-------------|
| Small (300×300) | 2.87s | 1.63s | 0.01s | **4.51s** | 262 MB |
| Medium (800×800) | 2.63s | 1.56s | 0.01s | **4.20s** | 271 MB |
| Large (1920×1080) | 7.34s | 1.70s | 0.04s | **9.09s** | 293 MB |

### Individual Operation Benchmarks

**Color Extraction (standalone):**

| Size | Time | Pixels |
|------|------|--------|
| Small (300×300) | 3.38s | 90K |
| Medium (800×800) | 3.80s | 640K |
| Large (1920×1080) | 7.01s | 2M |

**Garment Recoloring (standalone, includes bg removal):**

| Size | Time | Notes |
|------|------|-------|
| Small (300×300) | 1.75s | ~1.5s bg removal + ~0.2s HSV |
| Medium (800×800) | 1.86s | ~1.5s bg removal + ~0.3s HSV |
| Large (1920×1080) | 1.77s | ~1.5s bg removal + ~0.2s HSV |

---

## Bottleneck Analysis

### Time Distribution by Stage

| Size | Color Extraction | Background Removal | Recoloring |
|------|------------------|-------------------|------------|
| Small | **63.7%** | 36.1% | 0.2% |
| Medium | **62.5%** | 37.2% | 0.3% |
| Large | **80.8%** | 18.7% | 0.5% |

### Key Finding: Color Extraction is the Primary Bottleneck

```
Large Image Time Breakdown:
├── Color Extraction: 7.34s (80.8%) ████████████████████████████████████████░░░░░░░░░░
├── Background Removal: 1.70s (18.7%) █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
└── Garment Recoloring: 0.04s (0.5%)  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Root Cause Analysis

**1. Color Extraction (K-means clustering)**
- **Algorithm:** Scikit-learn KMeans with `n_init=10`
- **Complexity:** O(n × k × i × d) where n=pixels, k=clusters, i=iterations, d=dimensions
- **Scaling:** Linear with pixel count (2M pixels = ~7-8s)
- **Bottleneck:** CPU-bound, processes every pixel multiple times

**Why K-means is slow:**
- Processes every single pixel in the image
- For 1920×1080 = 2,073,600 pixels to cluster
- Each iteration recalculates distances for all pixels to all cluster centers
- Default `max_iter=300` iterations (can be overkill for color extraction)
- `n_init=10` means running the full algorithm 10 times with different initializations

**2. Background Removal (rembg)**
- **Algorithm:** U²-Net neural network inference
- **Complexity:** O(1) - fixed model inference time
- **Scaling:** Nearly constant regardless of image size (~1.5-1.7s)
- **Bottleneck:** Model loading + GPU/CPU inference

**3. Garment Recoloring (HSV transformation)**
- **Algorithm:** NumPy vectorized operations
- **Complexity:** O(n) where n=pixels
- **Scaling:** Linear but highly optimized (<0.05s for all sizes)
- **Bottleneck:** None - already optimal

---

## Optimization Strategies

> **Note:** Speedup estimates below are projections based on algorithmic analysis and general benchmarks, not measured on this specific codebase. Actual results may vary.

### Strategy 0: Lazy Loading for Memory Efficiency ✅ IMPLEMENTED

**Approach:** Import heavy libraries (rembg/onnxruntime) only when needed, not at server startup.

**Problem:** rembg with onnxruntime requires ~300-400MB memory just to import. On memory-constrained hosts (512MB), this causes OOM crashes at startup.

**Implementation:**
```python
# Before: Loads ~400MB at module import
from rembg import remove  # At top of file

# After: Loads only when recolor endpoint called
def remove_background(self):
    from rembg import remove  # Lazy import inside method
    self.image_no_bg = remove(self.image)
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| Startup Memory | ✅ ~200MB reduction |
| First Request | ⚠️ +2-3s latency (model loading) |
| Subsequent Requests | → Same as before |
| Implementation | ✅ Simple (move import) |

**Status:** ✅ Implemented for Railway deployment (Feb 2026)

---

### Strategy 1: Image Downscaling Before K-means

**Approach:** Resize image to max 400×400 before color extraction.

**Implementation:**
```python
def extract_colors_optimized(image_path, n_colors=5, max_size=400):
    image = cv2.imread(image_path)
    h, w = image.shape[:2]

    # Downscale if needed
    if max(h, w) > max_size:
        scale = max_size / max(h, w)
        image = cv2.resize(image, None, fx=scale, fy=scale)

    # Proceed with K-means on smaller image
    ...
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| Speed | ✅ 3-5x faster (2M→160K pixels) |
| Accuracy | ⚠️ May miss fine color details |
| Memory | ✅ Lower memory usage |
| Implementation | ✅ Simple (5 lines of code) |

**Status:** ✅ Implemented (April 2026) — frontend resizes yarn to 400x400, garment to 800x800 before upload. Server-side downscaling added as safety net.

---

### Strategy 2: MiniBatchKMeans Instead of KMeans

**Approach:** Use a faster version of K-means that only processes random samples of pixels instead of all pixels.

**How it works:**
- Standard K-means: Every iteration processes ALL 2M pixels
- MiniBatchKMeans: Each iteration only processes a random batch (e.g., 1024 pixels)
- Converges faster because it updates cluster centers more frequently with smaller batches
- Trades some accuracy for significant speed improvement

**Implementation:**
```python
from sklearn.cluster import MiniBatchKMeans

# Current
kmeans = KMeans(n_clusters=5, n_init=10, random_state=42)

# Optimized
kmeans = MiniBatchKMeans(n_clusters=5, batch_size=1024, random_state=42)
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| Speed | ✅ 2-3x faster on large images |
| Accuracy | ⚠️ Slightly less stable results |
| Memory | ✅ Much lower (processes batches) |
| Implementation | ✅ Drop-in replacement |

**Status:** ✅ Implemented (April 2026) — `MiniBatchKMeans(n_clusters=5, n_init=3, batch_size=1000)` replaces `KMeans`. Combined with n_init reduction (Strategy 3).

---

### Strategy 3: Reduce K-means Iterations

**Approach:** Reduce `n_init` from 10 to 3 and `max_iter` from default 300 to 100.

**Implementation:**
```python
# Current (conservative) - max_iter defaults to 300
kmeans = KMeans(n_clusters=5, n_init=10, random_state=42)

# Optimized (faster)
kmeans = KMeans(n_clusters=5, n_init=3, max_iter=100, random_state=42)
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| Speed | ✅ ~3x faster |
| Accuracy | ⚠️ May converge to local optimum |
| Memory | → No change |
| Implementation | ✅ Parameter change only |

**Status:** ✅ Implemented (April 2026) — n_init reduced to 3, combined with MiniBatchKMeans (Strategy 2).

---

### Strategy 4: Color Caching

**Approach:** Cache extracted colors keyed by image hash.

**Implementation:**
```python
import hashlib
from functools import lru_cache

def get_image_hash(image_path):
    with open(image_path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

@lru_cache(maxsize=100)
def extract_colors_cached(image_hash, n_colors):
    # Actual extraction logic
    ...
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| Speed | ✅ Instant for repeated images (0s) |
| Accuracy | ✅ No change (same results) |
| Memory | ⚠️ Cache storage (~1KB per entry) |
| Implementation | ⚠️ Moderate (hash calculation, cache invalidation) |

**Recommendation:** Implement for API server. Cache hit rate depends on user behavior (repeat yarn uploads).

---

### Strategy 5: GPU Acceleration for Background Removal

**Approach:** Use CUDA-enabled ONNX runtime for rembg.

**Implementation:**
```python
# Install GPU version
pip install onnxruntime-gpu

# rembg automatically uses GPU if available
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| Speed | ✅ 3-5x faster (~0.3-0.5s vs 1.5s) |
| Accuracy | ✅ No change |
| Memory | ⚠️ Requires GPU memory |
| Implementation | ⚠️ Requires CUDA setup, not portable |

**Recommendation:** Enable for production server with GPU. Keep CPU fallback for local development.

---

### Strategy 6: Parallel Processing

**Approach:** Run color extraction and background removal in parallel.

**Implementation:**
```python
import concurrent.futures

def full_workflow_parallel(yarn_path, garment_path, colors=None):
    with concurrent.futures.ThreadPoolExecutor() as executor:
        # Start both operations
        color_future = executor.submit(extract_colors, yarn_path)
        bg_future = executor.submit(remove_background, garment_path)

        # Wait for both
        colors = color_future.result()
        garment_no_bg = bg_future.result()

    # Sequential: apply colors (needs both results)
    return apply_colors(garment_no_bg, colors)
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| Speed | ✅ ~40% faster (parallel stages) |
| Accuracy | ✅ No change |
| Memory | ⚠️ Higher peak memory (both in RAM) |
| Implementation | ⚠️ Moderate complexity |

**Recommendation:** Implement for API endpoint. Not needed for CLI (sequential is fine).

---

## Prioritized Implementation Plan

### Phase 4A: Quick Wins (Low Effort, High Impact)

| # | Optimization | Expected Speedup | Effort |
|---|--------------|------------------|--------|
| 1 | Reduce K-means iterations (n_init=3) | ~2x | 1 hour |
| 2 | Image downscaling (max 400px) | ~3x | 2 hours |
| 3 | MiniBatchKMeans | ~2x | 2 hours |

**Combined expected improvement:** 4-6x faster color extraction

**New estimated times:**
- Small: ~2.5s (was 4.5s)
- Medium: ~2.3s (was 4.2s)
- Large: ~3.5s (was 9.1s)

### Phase 4B: Production Optimizations (Medium Effort)

| # | Optimization | Expected Speedup | Effort |
|---|--------------|------------------|--------|
| 4 | Color caching | 0s for cache hits | 1 day |
| 5 | Parallel processing | ~40% | 1 day |

### Phase 5: Infrastructure (High Effort)

| # | Optimization | Expected Speedup | Effort |
|---|--------------|------------------|--------|
| 6 | GPU acceleration | 3-5x on bg removal | 2-3 days |
| 7 | Worker queue (Celery) | Async processing | 1 week |

---

## Decision

### Selected Optimizations for Phase 4

1. **Image downscaling** - Implement with configurable max_size (default 400px)
2. **Reduced K-means iterations** - Change n_init from 10 to 3
3. **MiniBatchKMeans** - Replace standard KMeans

### Deferred to Later Phases

- Color caching (Phase 4B - needs API refactoring)
- Parallel processing (Phase 4B - needs testing)
- GPU acceleration (Phase 5 - infrastructure dependency)

### Implemented in April 2026

All Phase 4A optimizations plus additional memory optimizations driven by Railway's 512MB RAM limit:

| # | Optimization | Where | Impact |
|---|-------------|-------|--------|
| 1 | MiniBatchKMeans + n_init=3 | Backend (`yarn_color_extractor.py`) | ~100x faster color extraction |
| 2 | Frontend image resize before upload | Frontend (`App.tsx`) | Yarn: 400x400, Garment: 500x500. Reduces network transfer + server load |
| 3 | Server-side image downscale safety net | Backend (`main.py`) | Caps at 400px (extract) / 800px (recolor). Prevents OOM from direct API usage |
| 4 | Lightweight rembg model (`u2netp`) | Backend (`garment_recolor.py`) | ~50% less memory for background removal |
| 5 | AbortController for fetch cancellation | Frontend (`App.tsx`) | Cancels in-flight requests on reset, saves server resources |
| 6 | StrictMode-safe useEffect | Frontend (`App.tsx`) | Cancelled flag prevents double-fire from corrupting state |

**Measured results on Railway free tier (April 2026):**

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Color extraction | 72s | 692ms | **~100x faster** |
| Garment recoloring | 34s | 2.5s | **~14x faster** |
| Total workflow | 106s | ~3.2s | **~33x faster** |

- Memory: peaks ~400MB (was causing OOM at ~500MB+)

### Not Implementing

- Custom clustering algorithm - Too much effort, scikit-learn is good enough
- GPU acceleration - Railway free tier has no GPU

---

## Consequences

### Positive

- ✅ Target workflow time under 5s for all image sizes
- ✅ Improved user experience (faster feedback)
- ✅ Lower server costs (less CPU time per request)
- ✅ Simple implementations (parameter changes, not rewrites)

### Negative

- ⚠️ Slightly reduced color accuracy from downscaling
- ⚠️ Need to validate MiniBatchKMeans results
- ⚠️ More configuration options to maintain

### Neutral

- → Memory usage unchanged or slightly improved
- → No changes to API contract
- → Backward compatible

---

## Validation Plan

### Before Optimization

Run benchmark suite, record:
- Execution times for each stage
- Memory usage
- Extracted color values (ground truth)

### After Each Optimization

1. Run same benchmark suite
2. Compare times (should improve)
3. Compare extracted colors to ground truth
4. Calculate color difference (ΔE)
5. Accept if ΔE < 5 (noticeable but acceptable for color matching)

### Acceptance Criteria

| Metric | Target |
|--------|--------|
| Total workflow time (Large) | < 5s |
| Color accuracy (ΔE) | < 5 |
| Memory usage | ≤ current |
| Test suite | All passing |

---

## References

### Benchmarks

- [benchmarks/benchmark_full_workflow.py](../../benchmarks/benchmark_full_workflow.py) - Full workflow timing
- [benchmarks/workflow_results.md](../../benchmarks/workflow_results.md) - Latest results
- [benchmarks/benchmark_color_extractor.py](../../benchmarks/benchmark_color_extractor.py) - Color extraction timing
- [benchmarks/benchmark_recolor_garment.py](../../benchmarks/benchmark_recolor_garment.py) - Recoloring timing

### Documentation

- [scikit-learn KMeans](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html)
- [scikit-learn MiniBatchKMeans](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.MiniBatchKMeans.html)
- [rembg GPU support](https://github.com/danielgatis/rembg#gpu-support)
- [ONNX Runtime GPU](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html)

### Related ADRs

- [ADR 001: Color Filtering Strategy](001-color-filtering-strategy.md)
- [ADR 002: Background Removal](002-background-removal.md)
- [ADR 004: React Frontend Architecture](004-react-frontend-architecture.md)

---

**Status:** Analysis Complete, Optimizations Planned
**Review Date:** After Phase 4 implementation
**Last Updated:** February 5, 2026
