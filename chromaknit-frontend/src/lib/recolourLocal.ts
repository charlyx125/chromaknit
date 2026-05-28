/**
 * Browser-side port of core/garment_recolor.py:_apply_hsv_recoloring +
 * _get_color_mapping. Used by paint mode to render live brush previews
 * without round-tripping each stroke to the server.
 *
 * Validated against the Python reference in scripts/spike_hsv (mean abs RGB
 * diff 2-3 / 255 across realistic palettes; see scripts/spike_hsv/README.md
 * for the spike result).
 *
 * Conventions mirror OpenCV:
 *   H in [0, 179] (each unit = 2 degrees)
 *   S in [0, 255]
 *   V in [0, 255]
 *
 * Mask convention: 1-channel byte buffer, length = width * height.
 *   value >= 128 means the pixel is inside the region; otherwise skipped.
 */

// === Colour-space helpers (OpenCV-equivalent) ===

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max;
  const s = max > 0 ? ((max - min) * 255) / max : 0;
  let h = 0;
  const c = max - min;
  if (c !== 0) {
    if (max === r) h = 30 * ((g - b) / c);
    else if (max === g) h = 60 + 30 * ((b - r) / c);
    else h = 120 + 30 * ((r - g) / c);
    if (h < 0) h += 180;
  }
  return [h, s, v];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  if (s === 0) return [v, v, v];
  const hh = h / 30;
  const i = Math.floor(hh) % 6;
  const f = hh - Math.floor(hh);
  const sFrac = s / 255;
  const p = v * (1 - sFrac);
  const q = v * (1 - sFrac * f);
  const t = v * (1 - sFrac * (1 - f));
  switch (i) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

// === Brightness buffer ===

/**
 * Compute V = max(R, G, B) for every pixel of an RGBA buffer and return it as
 * a 1-channel Uint8Array. Used by paint mode to give `recolourLocal` a
 * read-only source of the ORIGINAL photo's brightness, so a stroke that
 * overlaps an earlier stroke still reads V from the untouched photo rather
 * than from the already-painted canvas. Without this, the second stroke
 * normalises against an already-compressed V range and produces a different
 * shade of the same yarn over the overlap (visible as a seam).
 *
 * 1 byte per pixel, contiguous, cache-friendly. The whole buffer for a
 * 1024x1024 photo is 1 MB.
 */
export function computeSourceV(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const total = width * height;
  const out = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const px = i * 4;
    let v = rgba[px];
    if (rgba[px + 1] > v) v = rgba[px + 1];
    if (rgba[px + 2] > v) v = rgba[px + 2];
    out[i] = v;
  }
  return out;
}

// === Stats ===

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Compute the 2nd / 98th percentile brightness (V) range over the foreground
 * pixels of an RGBA buffer.
 *
 * Used by paint mode so every stroke maps brightness against the same
 * garment-wide range. Without this, each stroke computes its own range from
 * its own masked pixels, and adjacent strokes show visible seams where the
 * normalisation disagrees.
 */
export function computeGarmentBrightnessRange(
  rgba: Uint8ClampedArray,
  foregroundMask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): { minV: number; maxV: number } {
  const total = width * height;
  let fgCount = 0;
  for (let i = 0; i < total; i++) if (foregroundMask[i] >= 128) fgCount++;
  if (fgCount === 0) return { minV: 0, maxV: 255 };

  const values = new Float32Array(fgCount);
  let j = 0;
  for (let i = 0; i < total; i++) {
    if (foregroundMask[i] >= 128) {
      const px = i * 4;
      const r = rgba[px];
      const g = rgba[px + 1];
      const b = rgba[px + 2];
      let v = r;
      if (g > v) v = g;
      if (b > v) v = b;
      values[j++] = v;
    }
  }
  values.sort();
  return { minV: percentile(values, 2), maxV: percentile(values, 98) };
}

// === Pixel-to-band assignment ===

function getColorMapping(
  brightnessValues: Float32Array,
  numColors: number,
  weights: number[] | null,
): Int32Array {
  const n = brightnessValues.length;
  const indices = new Int32Array(n);
  if (n === 0) return indices;

  if (!weights || weights.length !== numColors) {
    let minB = Infinity;
    let maxB = -Infinity;
    for (let i = 0; i < n; i++) {
      const b = brightnessValues[i];
      if (b < minB) minB = b;
      if (b > maxB) maxB = b;
    }
    if (maxB > minB) {
      const range = maxB - minB;
      for (let i = 0; i < n; i++) {
        const norm = (brightnessValues[i] - minB) / range;
        indices[i] = Math.floor(norm * (numColors - 1));
      }
    }
    return indices;
  }

  // Weighted distribution: sort by brightness, slice into bands sized by
  // cumulative weight. Mirrors the Python implementation.
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => brightnessValues[a] - brightnessValues[b]);

  let cumulative = 0;
  let pixelStart = 0;
  for (let colorIdx = 0; colorIdx < numColors; colorIdx++) {
    cumulative += weights[colorIdx];
    let pixelEnd = Math.round(cumulative * n);
    if (pixelEnd > n) pixelEnd = n;
    for (let p = pixelStart; p < pixelEnd; p++) {
      indices[order[p]] = colorIdx;
    }
    pixelStart = pixelEnd;
  }
  return indices;
}

// === Public entry point ===

/**
 * Apply the HSV recolour to a region of an RGBA pixel buffer.
 *
 * @param rgba    canvas image data (length = w*h*4). Modified in place.
 * @param mask    1-channel mask (length = w*h). Pixels with mask[i] >= 128
 *                are recoloured; others are left untouched.
 * @param width
 * @param height
 * @param hexPalette  e.g. ["#440022", "#aa3344"]
 * @param weights     optional, parallel to hexPalette, sums to ~1.
 * @param precomputedRange  optional foreground brightness range to use
 *                instead of computing one from this call's masked pixels.
 *                Paint mode passes a garment-wide range so adjacent strokes
 *                normalise consistently and don't show seams. When null,
 *                the function falls back to per-call percentile of the
 *                masked pixels (original whole-garment Auto-mode behaviour).
 * @param sourceV optional 1-channel buffer of V values from the ORIGINAL
 *                photo. When provided, brightness is read from here instead
 *                of recomputed from `rgba`. Paint mode passes this so a
 *                second stroke over an already-painted area still reads V
 *                from the untouched original (otherwise the recolour reads
 *                the already-compressed V written by the first stroke and
 *                produces a different shade of the same yarn over the
 *                overlap). When null, V is computed from `rgba` (Auto-mode
 *                behaviour, where a single call mutates a fresh buffer).
 */
export function recolourLocal(
  rgba: Uint8ClampedArray,
  mask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  hexPalette: string[],
  weights: number[] | null = null,
  precomputedRange: { minV: number; maxV: number } | null = null,
  sourceV: Uint8Array | null = null,
): void {
  // 1. Palette in HSV, sorted by V (brightness), with weights aligned.
  const paletteHsv = hexPalette.map((h) => {
    const [r, g, b] = hexToRgb(h);
    return rgbToHsv(r, g, b);
  });

  const order = paletteHsv.map((_, i) => i).sort(
    (a, b) => paletteHsv[a][2] - paletteHsv[b][2],
  );
  const sortedPalette = order.map((i) => paletteHsv[i]);
  const sortedWeights = weights && weights.length === paletteHsv.length
    ? order.map((i) => weights[i])
    : null;

  // 2. Walk in-region pixels (any mask > 0). Soft-edge stamps produce
  //    fractional alpha at the brush boundary; we colour those pixels too
  //    but blend proportionally with the original at write time.
  const total = width * height;
  let count = 0;
  for (let i = 0; i < total; i++) if (mask[i] > 0) count++;
  if (count === 0) return;

  const indices = new Int32Array(count);
  const brightness = new Float32Array(count);
  let j = 0;
  if (sourceV) {
    // Read V from the original-photo buffer so overlapping strokes always
    // see the untouched brightness, not the canvas the previous stroke
    // wrote into.
    for (let i = 0; i < total; i++) {
      if (mask[i] > 0) {
        indices[j] = i;
        brightness[j] = sourceV[i];
        j++;
      }
    }
  } else {
    for (let i = 0; i < total; i++) {
      if (mask[i] > 0) {
        indices[j] = i;
        const px = i * 4;
        const r = rgba[px];
        const g = rgba[px + 1];
        const b = rgba[px + 2];
        let v = r;
        if (g > v) v = g;
        if (b > v) v = b;
        brightness[j] = v;
        j++;
      }
    }
  }

  // 3. Garment brightness range. If the caller passed a precomputed range
  //    (paint mode does this so all strokes normalise consistently), use
  //    that. Otherwise fall back to per-call percentile from the fully-in
  //    pixels (the legacy whole-garment Auto path).
  let garmentMinV: number;
  let garmentMaxV: number;
  if (precomputedRange) {
    garmentMinV = precomputedRange.minV;
    garmentMaxV = precomputedRange.maxV;
  } else {
    let fullyInCount = 0;
    for (let k = 0; k < count; k++) {
      if (mask[indices[k]] >= 128) fullyInCount++;
    }
    let fullyInValues: Float32Array;
    if (fullyInCount === 0) {
      fullyInValues = brightness;
    } else {
      fullyInValues = new Float32Array(fullyInCount);
      let f = 0;
      for (let k = 0; k < count; k++) {
        if (mask[indices[k]] >= 128) {
          fullyInValues[f++] = brightness[k];
        }
      }
    }
    const sorted = Float32Array.from(fullyInValues);
    sorted.sort();
    garmentMinV = percentile(sorted, 2);
    garmentMaxV = percentile(sorted, 98);
  }
  let garmentRange = garmentMaxV - garmentMinV;
  if (garmentRange < 1) garmentRange = 1;

  // 4. Yarn brightness range for the per-band texture spread.
  let yarnMinV = Infinity;
  let yarnMaxV = -Infinity;
  for (const c of sortedPalette) {
    if (c[2] < yarnMinV) yarnMinV = c[2];
    if (c[2] > yarnMaxV) yarnMaxV = c[2];
  }

  // 5. Assign each in-region pixel to a colour band.
  const colorIndices = getColorMapping(brightness, sortedPalette.length, sortedWeights);

  // 6. Per-pixel: replace H/S, remap V, blend with original by mask alpha.
  for (let k = 0; k < count; k++) {
    const pxIdx = indices[k];
    const px = pxIdx * 4;
    const targetHsv = sortedPalette[colorIndices[k]];
    const originalV = brightness[k];

    let normalized = (originalV - garmentMinV) / garmentRange;
    if (normalized < 0) normalized = 0;
    if (normalized > 1) normalized = 1;

    const targetV = targetHsv[2];
    const spread = (yarnMaxV - yarnMinV) * 0.15;
    const lowV = Math.max(0, targetV - spread);
    const highV = Math.min(255, targetV + spread);
    const remappedV = lowV + normalized * (highV - lowV);

    const [newR, newG, newB] = hsvToRgb(targetHsv[0], targetHsv[1], remappedV);
    const alpha = mask[pxIdx] / 255;
    const inv = 1 - alpha;
    rgba[px] = rgba[px] * inv + newR * alpha;
    rgba[px + 1] = rgba[px + 1] * inv + newG * alpha;
    rgba[px + 2] = rgba[px + 2] * inv + newB * alpha;
    // alpha unchanged
  }
}

// === Brush mask helpers (used by paint mode) ===

// Soft brush hardness: fraction of the radius that's fully opaque before the
// linear fade to 0. 0.7 = 70% solid core with a 30% feathered edge. Lower
// values produce softer brushes; 1.0 reproduces the previous hard-edge stamp.
const BRUSH_HARDNESS = 0.7;

/**
 * Stamp a soft circle of `radius` at (cx, cy) into a 1-channel mask. The
 * circle has a fully opaque core (proportion controlled by BRUSH_HARDNESS)
 * and a linear falloff to 0 at the edge, so painted strokes blend cleanly
 * with the underlying image instead of producing hard binary boundaries.
 *
 * Optional `clip` mask: if provided, pixels where clip[i] < 128 are skipped.
 * Used by paint mode to constrain strokes to the rembg foreground.
 */
export function stampCircle(
  mask: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  clip?: Uint8Array,
): void {
  const innerRadius = radius * BRUSH_HARDNESS;
  const featherRange = radius - innerRadius;
  const r2 = radius * radius;
  const yMin = Math.max(0, Math.floor(cy - radius));
  const yMax = Math.min(height - 1, Math.ceil(cy + radius));
  const xMin = Math.max(0, Math.floor(cx - radius));
  const xMax = Math.min(width - 1, Math.ceil(cx + radius));
  for (let y = yMin; y <= yMax; y++) {
    const dy = y - cy;
    const dy2 = dy * dy;
    for (let x = xMin; x <= xMax; x++) {
      const dx = x - cx;
      const distSq = dx * dx + dy2;
      if (distSq > r2) continue;
      const idx = y * width + x;
      if (clip && clip[idx] < 128) continue;
      const dist = Math.sqrt(distSq);
      let alpha: number;
      if (dist <= innerRadius || featherRange <= 0) {
        alpha = 255;
      } else {
        alpha = Math.round(255 * (1 - (dist - innerRadius) / featherRange));
      }
      // Max compositing: overlapping stamps preserve the highest opacity so
      // a slow drag doesn't accumulate beyond fully opaque.
      if (alpha > mask[idx]) mask[idx] = alpha;
    }
  }
}

/**
 * Stamp circles along the line from (x0, y0) to (x1, y1) at radius. Used for
 * painting smooth strokes between sparse pointer-move events.
 */
export function stampLine(
  mask: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  clip?: Uint8Array,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Sample every half-radius so circles overlap and the stroke has no gaps.
  const step = Math.max(1, radius / 2);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stampCircle(mask, width, height, x0 + dx * t, y0 + dy * t, radius, clip);
  }
}
