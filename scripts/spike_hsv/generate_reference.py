"""
Generate reference outputs from the production HSV remap pipeline.

Spike for Phase 2: produces a fixed set of (input, mask, output, palette)
test cases that the JS port harness loads and compares against. Saving the
reference here means the harness does not need to hit the live API and we can
reason about visual differences in isolation.

Output files (all in scripts/spike_hsv/refs/):
  - input.png       the downscaled garment image, BGR encoded
  - mask.png        grayscale uint8 mask (255 = foreground)
  - reference.png   the server recolour output for the metadata palette
  - metadata.json   palette + weights used, plus dimensions

Run from repo root:
  python -m scripts.spike_hsv.generate_reference

You can tweak SAMPLE_GARMENT and TARGET_PALETTE at the top of the file to
generate alternative reference cases.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from core.garment_recolor import GarmentRecolorer


# === Spike inputs (edit to vary the test case) ===

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_GARMENT = REPO_ROOT / "chromaknit-frontend" / "public" / "samples" / "garment-cardigan.jpg"

# Realistic palette: extracted from samples/yarn-mint.jpg via the production
# ColorExtractor (5 colours by frequency). Tonal variations of mint, which
# is how real variegated yarn palettes look. Edit to test other yarns.
TARGET_PALETTE = ["#a9cdc0", "#bce0d4", "#8bb5a4", "#d3f1e9", "#5d8979"]
TARGET_WEIGHTS = [0.3192, 0.3007, 0.1658, 0.153, 0.0614]

OUTPUT_DIR = Path(__file__).resolve().parent / "refs"


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not SAMPLE_GARMENT.exists():
        raise FileNotFoundError(f"Sample garment not found: {SAMPLE_GARMENT}")

    # Step 1: load + downscale the same way the API would.
    img = cv2.imread(str(SAMPLE_GARMENT))
    if img is None:
        raise RuntimeError(f"cv2.imread returned None for {SAMPLE_GARMENT}")
    h, w = img.shape[:2]
    max_dim = 800
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    # Save the resized input so the JS port works on the exact same bytes.
    input_path = OUTPUT_DIR / "input.png"
    cv2.imwrite(str(input_path), img)

    # Step 2: run the production pipeline.
    # We construct the recolorer with a path so load_image works, then call
    # prepare() (load + rembg) to get the mask, then apply_colors() to get
    # the recoloured output.
    recolorer = GarmentRecolorer(garment_image_path=str(input_path))
    if not recolorer.prepare():
        raise RuntimeError("GarmentRecolorer.prepare() failed (load or rembg)")

    if not recolorer.apply_colors(TARGET_PALETTE, weights=TARGET_WEIGHTS):
        raise RuntimeError("GarmentRecolorer.apply_colors() failed")

    # Step 3: save mask + reference output.
    mask_path = OUTPUT_DIR / "mask.png"
    cv2.imwrite(str(mask_path), recolorer.mask)

    reference_path = OUTPUT_DIR / "reference.png"
    cv2.imwrite(str(reference_path), recolorer.recolored_image)

    # Step 4: metadata so the JS harness knows what palette to use.
    height, width = recolorer.image.shape[:2]
    metadata = {
        "input": "input.png",
        "mask": "mask.png",
        "reference": "reference.png",
        "palette": TARGET_PALETTE,
        "weights": TARGET_WEIGHTS,
        "width": int(width),
        "height": int(height),
        "notes": (
            "input.png is BGR-encoded by cv2.imwrite; the JS harness must "
            "decode it via the browser <img> tag (which auto-converts to RGB) "
            "and convert RGB->HSV using the OpenCV convention "
            "(H in [0,179], S in [0,255], V in [0,255])."
        ),
    }
    metadata_path = OUTPUT_DIR / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2))

    print(f"Wrote reference outputs to {OUTPUT_DIR}")
    print(f"  input:      {input_path.name}  ({width}x{height})")
    print(f"  mask:       {mask_path.name}")
    print(f"  reference:  {reference_path.name}")
    print(f"  metadata:   {metadata_path.name}")
    print(f"  palette:    {TARGET_PALETTE}")


if __name__ == "__main__":
    main()
