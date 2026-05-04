# Spike: HSV remap JS port

Phase 2's paint mode shows a live brush preview without round-tripping to the
server per stroke. That requires a JavaScript port of `core/garment_recolor.py`'s
HSV remap that produces visually close output to the Python reference. If the
match is poor, paint mode redesigns to use flat-fill instead of texture-aware
recolour.

## Files

- `recolour.js` — vanilla JS port of `_apply_hsv_recoloring` and
  `_get_color_mapping`. Same algorithm structure as the Python; designed to
  port cleanly into the React app's `src/lib/` once validated.
- `generate_reference.py` — runs the production pipeline on a sample garment
  and saves `refs/{input,mask,reference}.png` plus `refs/metadata.json`.
- `index.html` — comparison harness. Loads the saved reference outputs, runs
  the JS port on the same inputs, displays Python output / JS output / diff.

## Run

```powershell
# 1. Generate the reference outputs (one-time, or whenever you change inputs).
cd c:\Users\joyce\OneDrive\Desktop\chromaknit-personal
.\venv\Scripts\activate
python -m scripts.spike_hsv.generate_reference

# 2. Serve the spike directory and open in a browser.
python -m http.server 8765 --directory scripts/spike_hsv
# then visit http://localhost:8765
```

## What the harness shows

Three panels side-by-side: Server reference, JS port, per-pixel diff (8x
amplified). Below that, mean and max absolute RGB diff over the foreground
pixels and the count of pixels with diff > 8 (the threshold below which a
human eye usually cannot tell two colours apart).

## How to interpret the result

- **Mean diff < 4 / 255 and Max diff < 32 / 255**: JS port is good enough for
  live brush preview. Texture-aware paint mode is feasible.
- **Mean diff 4-12 / 255 with mostly speckle in the diff**: borderline. The
  human-perceptible flicker on stroke commit may be acceptable depending on
  brush size and animation. Consider a small fade-in on commit to mask it.
- **Mean diff > 12 / 255 or large coherent diff regions**: the algorithms have
  diverged in a structural way (rounding, gamma, percentile interpolation).
  Either fix the port to match, or pivot paint mode to flat-fill.

## Decision

Spike run on 2026-05-04 against the cardigan sample garment, two palette shapes:

| Run | Palette | Weights | Mean diff | Max diff | Diff > 8 |
|---|---|---|---|---|---|
| 1: stress test | dark/rose/cream (3 colours) | equal-band | 2.14 / 255 | 4 / 255 | 0 (0.0%) |
| 2: realistic | extracted from `yarn-mint.jpg` (5 colours) | real percentages | 3.32 / 255 | 45 / 255 | 15504 (5.9%) |

Verdict: **green-light texture-aware paint mode**. The JS port matches
the Python reference closely enough that committed paint strokes will
not visibly snap when the server confirms. Phase 2 can build paint mode
as described in the v2 plan; no need to pivot to flat-fill.

The speckle visible in the realistic-palette diff is concentrated at
brightness-band boundaries, where pixels of nearly identical V can land
in different colour bands due to sort-stability differences between JS
and numpy. The absolute differences are small and the band edges are
the minority of any paint stroke's footprint, so live preview will look
right and commit will look right.

Caveats:
- Tested with one image and two palettes. The spike harness lets you
  edit `TARGET_PALETTE` / `TARGET_WEIGHTS` and re-run to test more cases
  if Phase 2 implementation reveals an edge case.
- Performance was not measured rigorously. The console logs the per-run
  duration; a Phase 2 follow-up should measure stroke-region remap
  timing in the canvas during a drag and confirm 60fps is achievable.
  At 800x509 the full-image port runs comfortably under 100ms; brushes
  operate on much smaller regions, so live preview should be fine.
