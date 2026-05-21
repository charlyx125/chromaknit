"""
Generate a fixture for the recolourLocal parity regression test.

The fixture captures the output of the production Python pipeline on a
single (garment, yarn) pair. The Vitest parity test loads these files,
runs the JS port at chromaknit-frontend/src/lib/recolourLocal.ts on the
same inputs, and asserts pixel RMSE is below threshold.

Two failure modes the test catches:
  1. JS port drift: someone modifies recolourLocal.ts in a way that
     diverges from the Python reference. Test fails before merge.
  2. Cross-path drift: the sample flow (precomputed range, static mask)
     and the upload flow (compute range client-side) must produce the
     same output for the same inputs. Test B in the suite asserts this.

Why a separate fixture rather than re-using the precomputed sample
assets: the precomputed assets are full-resolution (940x599 cardigan,
940x1200 beanie). Committing those as raw RGBA fixtures would add 3+ MB
to the repo for marginal extra signal. We downscale to a 256-max-dim
copy for the fixture, which exercises identical algorithm paths in a
~400 KB total footprint.

Run from the repo root:

    .\\venv\\Scripts\\python.exe -m scripts.generate_parity_fixture

Re-run when:
  - core/garment_recolor.py:apply_colors changes
  - core/yarn_color_extractor.py changes the palette format
  - chromaknit-frontend/src/lib/recolourLocal.ts changes its algorithm
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from core.garment_recolor import GarmentRecolorer
from core.yarn_color_extractor import ColorExtractor


REPO_ROOT = Path(__file__).resolve().parents[1]
GARMENT_PATH = REPO_ROOT / "chromaknit-frontend/public/samples/garment-cardigan.jpg"
YARN_PATH = REPO_ROOT / "chromaknit-frontend/public/samples/yarn-mint.jpg"
OUTPUT_DIR = REPO_ROOT / "chromaknit-frontend/src/lib/__fixtures__/parity"
MAX_DIM = 256
N_COLORS = 10


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load and downscale the garment so the fixture stays small.
    raw = cv2.imread(str(GARMENT_PATH))
    if raw is None:
        raise FileNotFoundError(f"Could not read {GARMENT_PATH}")
    h, w = raw.shape[:2]
    if max(h, w) > MAX_DIM:
        scale = MAX_DIM / max(h, w)
        raw = cv2.resize(raw, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    # Write the downscaled input to a temp file so the recolorer can load it
    # via its existing path-based interface.
    tmp_input = OUTPUT_DIR / "_tmp-input.jpg"
    cv2.imwrite(str(tmp_input), raw)

    try:
        recolorer = GarmentRecolorer(garment_image_path=str(tmp_input))
        if not recolorer.prepare():
            raise RuntimeError("GarmentRecolorer.prepare() failed on the downscaled input")

        # Extract yarn palette from the live extractor so the fixture matches
        # what the API would produce for an upload of this yarn photo.
        extractor = ColorExtractor(image_path=str(YARN_PATH), n_colors=N_COLORS)
        palette = extractor.extract_dominant_colors()
        if not palette:
            raise RuntimeError("ColorExtractor returned no colours")
        total = float(extractor.counts.sum())
        percentages = [round(float(c) / total, 4) for c in extractor.counts]

        # Capture the foreground brightness range from the same pixels the
        # JS port would see (max(R, G, B) per pixel, 2nd / 98th percentile).
        v_per_pixel = recolorer.image.max(axis=2)
        fg_v = v_per_pixel[recolorer.mask >= 128]
        brightness_range = {
            "minV": float(np.percentile(fg_v, 2)),
            "maxV": float(np.percentile(fg_v, 98)),
        }

        # Run the production recolour pipeline.
        if not recolorer.apply_colors(palette, weights=percentages):
            raise RuntimeError("GarmentRecolorer.apply_colors failed")

        height, width = recolorer.image.shape[:2]

        # Save raw RGBA buffers so the JS test can load them directly via
        # fs.readFileSync without needing a PNG decoder. Each pixel is
        # 4 bytes [R, G, B, 255]. width * height * 4 bytes total.
        input_rgb = cv2.cvtColor(recolorer.image, cv2.COLOR_BGR2RGB)
        input_rgba = np.dstack([
            input_rgb,
            np.full((height, width), 255, dtype=np.uint8),
        ]).astype(np.uint8)
        (OUTPUT_DIR / "input-rgba.bin").write_bytes(input_rgba.tobytes())

        expected_rgb = cv2.cvtColor(recolorer.recolored_image, cv2.COLOR_BGR2RGB)
        expected_rgba = np.dstack([
            expected_rgb,
            np.full((height, width), 255, dtype=np.uint8),
        ]).astype(np.uint8)
        (OUTPUT_DIR / "expected-rgba.bin").write_bytes(expected_rgba.tobytes())

        # Mask as raw bytes; one byte per pixel, foreground >= 128.
        (OUTPUT_DIR / "mask.bin").write_bytes(recolorer.mask.astype(np.uint8).tobytes())

        # Metadata describing the fixture.
        meta = {
            "label": "cardigan + mint",
            "width": int(width),
            "height": int(height),
            "palette": palette,
            "percentages": percentages,
            "brightnessRange": brightness_range,
            "garmentSource": str(GARMENT_PATH.relative_to(REPO_ROOT)),
            "yarnSource": str(YARN_PATH.relative_to(REPO_ROOT)),
            "maxDim": MAX_DIM,
        }
        (OUTPUT_DIR / "meta.json").write_text(json.dumps(meta, indent=2))

        print("Wrote parity fixture:")
        print(f"  dir:        {OUTPUT_DIR.relative_to(REPO_ROOT)}")
        print(f"  dimensions: {width}x{height}")
        print(f"  palette:    {len(palette)} colours, first 3 {palette[:3]}")
        print(f"  V range:    {brightness_range['minV']:.1f} - {brightness_range['maxV']:.1f}")
        print(f"  files:      input-rgba.bin ({width*height*4} bytes), expected-rgba.bin, mask.bin, meta.json")

    finally:
        if tmp_input.exists():
            tmp_input.unlink()


if __name__ == "__main__":
    main()
