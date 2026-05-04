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
 */
export function recolourLocal(
  rgba: Uint8ClampedArray,
  mask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  hexPalette: string[],
  weights: number[] | null = null,
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

  // 2. Walk the foreground pixels: gather indices and brightness (V channel).
  const total = width * height;
  let fgCount = 0;
  for (let i = 0; i < total; i++) if (mask[i] >= 128) fgCount++;
  if (fgCount === 0) return;

  const fgIndices = new Int32Array(fgCount);
  const fgBrightness = new Float32Array(fgCount);
  let j = 0;
  for (let i = 0; i < total; i++) {
    if (mask[i] >= 128) {
      fgIndices[j] = i;
      const px = i * 4;
      const r = rgba[px];
      const g = rgba[px + 1];
      const b = rgba[px + 2];
      let v = r;
      if (g > v) v = g;
      if (b > v) v = b;
      fgBrightness[j] = v;
      j++;
    }
  }

  // 3. Garment brightness range (2nd / 98th percentile, like the Python).
  const sorted = Float32Array.from(fgBrightness);
  sorted.sort();
  const garmentMinV = percentile(sorted, 2);
  const garmentMaxV = percentile(sorted, 98);
  let garmentRange = garmentMaxV - garmentMinV;
  if (garmentRange < 1) garmentRange = 1;

  // 4. Yarn brightness range for the per-band texture spread.
  let yarnMinV = Infinity;
  let yarnMaxV = -Infinity;
  for (const c of sortedPalette) {
    if (c[2] < yarnMinV) yarnMinV = c[2];
    if (c[2] > yarnMaxV) yarnMaxV = c[2];
  }

  // 5. Assign each foreground pixel to a colour band.
  const colorIndices = getColorMapping(fgBrightness, sortedPalette.length, sortedWeights);

  // 6. Per-pixel: replace H/S, remap V to ±15% of yarn range around target V.
  for (let k = 0; k < fgCount; k++) {
    const pxIdx = fgIndices[k];
    const px = pxIdx * 4;
    const targetHsv = sortedPalette[colorIndices[k]];
    const originalV = fgBrightness[k];

    let normalized = (originalV - garmentMinV) / garmentRange;
    if (normalized < 0) normalized = 0;
    if (normalized > 1) normalized = 1;

    const targetV = targetHsv[2];
    const spread = (yarnMaxV - yarnMinV) * 0.15;
    const lowV = Math.max(0, targetV - spread);
    const highV = Math.min(255, targetV + spread);
    const remappedV = lowV + normalized * (highV - lowV);

    const [r2, g2, b2] = hsvToRgb(targetHsv[0], targetHsv[1], remappedV);
    rgba[px] = r2;
    rgba[px + 1] = g2;
    rgba[px + 2] = b2;
    // alpha unchanged
  }
}

// === Brush mask helpers (used by paint mode) ===

/** Stamp a filled circle of `radius` at (cx, cy) into a 1-channel mask. */
export function stampCircle(
  mask: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): void {
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
      if (dx * dx + dy2 <= r2) {
        mask[y * width + x] = 255;
      }
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
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Sample every half-radius so circles overlap and the stroke has no gaps.
  const step = Math.max(1, radius / 2);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stampCircle(mask, width, height, x0 + dx * t, y0 + dy * t, radius);
  }
}
