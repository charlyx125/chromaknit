/**
 * JS port of core/garment_recolor.py:_apply_hsv_recoloring + _get_color_mapping.
 *
 * The point of this file is to mirror the production Python algorithm closely
 * enough that committed paint strokes, when round-tripped through the server,
 * land at very nearly the same pixels the JS preview produced. If they don't,
 * Phase 2's paint mode pivots from texture-aware recolour to flat-fill.
 *
 * Conventions (matching OpenCV and the Python reference):
 *   - Image arrays are row-major Uint8 with channels in RGB order from
 *     <canvas> getImageData. We convert RGB <-> HSV using the OpenCV scaling:
 *       H in [0, 179] (each unit = 2 degrees)
 *       S in [0, 255]
 *       V in [0, 255]
 *   - Mask is a 1-channel Uint8 array; values >= 128 count as foreground.
 *
 * Public API:
 *   recolourLocal(rgbaPixels, maskPixels, width, height, hexPalette, weights?)
 *     -> Uint8ClampedArray (RGBA), same length as rgbaPixels.
 */

(function (global) {
  "use strict";

  // === Colour-space conversions (OpenCV-equivalent) ===

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }

  function rgbToHsv(r, g, b) {
    // Returns [h, s, v] with OpenCV scaling.
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    let s = 0;
    if (max > 0) s = ((max - min) * 255) / max;

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

  function hsvToRgb(h, s, v) {
    // OpenCV scaling on input.
    if (s === 0) return [v, v, v];

    const hh = h / 30; // sector index 0..5 (h is in 0..180)
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

  // === Percentile (matches numpy default linear interpolation) ===

  function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  }

  // === Colour mapping (mirrors _get_color_mapping in Python) ===

  function getColorMapping(brightnessValues, numColors, weights) {
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
          // Python uses .astype(int) which truncates toward zero; Math.floor
          // matches for non-negative values, which is always the case here
          // because norm is in [0, 1].
          indices[i] = Math.floor(norm * (numColors - 1));
        }
      }
      return indices;
    }

    // Weighted distribution: sort pixels by brightness, slice into bands sized
    // by cumulative weight. Same approach as the Python implementation.
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

  // === Main recolour entry point ===

  /**
   * Apply the HSV recolour to an RGBA pixel buffer.
   * @param {Uint8ClampedArray} rgba - canvas image data, length = w*h*4
   * @param {Uint8ClampedArray|Uint8Array} mask - 1-channel mask, length = w*h. >= 128 = foreground.
   * @param {number} width
   * @param {number} height
   * @param {string[]} hexPalette - e.g. ["#440022", "#aa3344"]
   * @param {number[]|null} weights - optional, parallel to hexPalette, sums to ~1.
   * @returns {Uint8ClampedArray} new RGBA buffer, same length as input.
   */
  function recolourLocal(rgba, mask, width, height, hexPalette, weights) {
    // 1. Convert palette to HSV and sort by brightness (V), keeping weights aligned.
    const paletteHsv = hexPalette.map((h) => {
      const [r, g, b] = hexToRgb(h);
      return rgbToHsv(r, g, b);
    });

    let order;
    if (weights && weights.length === paletteHsv.length) {
      order = paletteHsv.map((_, i) => i).sort(
        (a, b) => paletteHsv[a][2] - paletteHsv[b][2],
      );
    } else {
      order = paletteHsv.map((_, i) => i).sort(
        (a, b) => paletteHsv[a][2] - paletteHsv[b][2],
      );
    }
    const sortedPalette = order.map((i) => paletteHsv[i]);
    const sortedWeights = weights && weights.length === paletteHsv.length
      ? order.map((i) => weights[i])
      : null;

    // 2. Walk the foreground pixels: collect their indices and brightness values.
    const total = width * height;
    let fgCount = 0;
    for (let i = 0; i < total; i++) if (mask[i] >= 128) fgCount++;

    const fgIndices = new Int32Array(fgCount);
    const fgBrightness = new Float32Array(fgCount);
    {
      let j = 0;
      for (let i = 0; i < total; i++) {
        if (mask[i] >= 128) {
          fgIndices[j] = i;
          // V channel = max(R,G,B). Compute on the fly to avoid storing HSV up front.
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
    }

    if (fgCount === 0) return new Uint8ClampedArray(rgba);

    // 3. Compute the garment brightness range using 2nd/98th percentile.
    const sorted = Float32Array.from(fgBrightness);
    sorted.sort();
    const garmentMinV = percentile(sorted, 2);
    const garmentMaxV = percentile(sorted, 98);
    let garmentRange = garmentMaxV - garmentMinV;
    if (garmentRange < 1) garmentRange = 1;

    // 4. Yarn brightness range for the per-band remap spread.
    let yarnMinV = Infinity;
    let yarnMaxV = -Infinity;
    for (const c of sortedPalette) {
      if (c[2] < yarnMinV) yarnMinV = c[2];
      if (c[2] > yarnMaxV) yarnMaxV = c[2];
    }

    // 5. Assign each foreground pixel to a colour band by brightness rank or weight.
    const colorIndices = getColorMapping(fgBrightness, sortedPalette.length, sortedWeights);

    // 6. Per-pixel: replace H/S, remap V to ±15% of yarn range around target V.
    const out = new Uint8ClampedArray(rgba); // copy; non-mask pixels stay as-is

    for (let j = 0; j < fgCount; j++) {
      const pxIdx = fgIndices[j];
      const px = pxIdx * 4;
      const targetHsv = sortedPalette[colorIndices[j]];
      const originalV = fgBrightness[j];

      let normalized = (originalV - garmentMinV) / garmentRange;
      if (normalized < 0) normalized = 0;
      if (normalized > 1) normalized = 1;

      const targetV = targetHsv[2];
      const spread = (yarnMaxV - yarnMinV) * 0.15;
      const lowV = Math.max(0, targetV - spread);
      const highV = Math.min(255, targetV + spread);
      const remappedV = lowV + normalized * (highV - lowV);

      const [r2, g2, b2] = hsvToRgb(targetHsv[0], targetHsv[1], remappedV);
      out[px] = r2;
      out[px + 1] = g2;
      out[px + 2] = b2;
      // alpha unchanged
    }

    return out;
  }

  // Expose to global scope (the harness uses a <script> tag, not modules).
  global.recolourLocal = recolourLocal;
  global._recolourSpikeInternals = { rgbToHsv, hsvToRgb, percentile, getColorMapping };
})(typeof window !== "undefined" ? window : globalThis);
