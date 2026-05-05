"""
Precompute static assets for the demo path so the deployed app can run sample
flows without any backend calls.

For each yarn sample, runs ColorExtractor and writes a JSON file containing
the extracted palette and per-colour percentages. The frontend reads this
JSON when the user clicks a sample yarn and skips the POST to
/api/colors/extract entirely.

For each garment sample, runs GarmentRecolorer.prepare() (load + rembg) and
writes both a JSON file (dimensions + foreground brightness range) and a
PNG file (the rembg foreground mask). The frontend reads these when the
user clicks a sample garment and skips the POST to /api/garments/session
entirely. The brightness range matches what `recolourLocal.ts` would
compute from the original RGBA buffer plus the same mask, so the
client-side recolour uses the garment-wide normalisation that the
shared-brightness-range fix introduced earlier.

Outputs go to chromaknit-frontend/public/samples/precomputed/ and are
committed to the repo. They get redeployed on every Vercel build, so
sample interactions remain free for as long as ChromaKnit ships.

Run from the repo root:

    .\\venv\\Scripts\\python.exe -m scripts.precompute_samples

Re-run whenever the sample image set changes or when the algorithms in
ColorExtractor / GarmentRecolorer.prepare() change in ways that should
flow through to the demo path.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from core.yarn_color_extractor import ColorExtractor
from core.garment_recolor import GarmentRecolorer


# === Sample registry: must match the YarnPicker and GarmentStage components ===
#
# If the frontend adds, removes, or relabels a sample, mirror that change
# here and re-run the script. There is no runtime check that catches drift
# between this list and the frontend; if a label doesn't match, the
# frontend's static fetch returns 404 and the user sees a missing sample.

YARN_SAMPLES = [
    ("plum", "dark-red-purple-yarn.jpg"),
    ("pink", "yarn-pink-unknit.jpg"),
    ("coral pink", "coral-pink-yarn.jpg"),
    ("coral red", "yarn-red.png"),
    ("lime", "yarn-green.jpg"),
    ("pastel green", "yarn-light-green.jpg"),
    ("mint", "yarn-mint.jpg"),
    ("forest green", "yarn-dark-green.jpg"),
    ("dark blue", "yarn-dark-blue.jpg"),
    ("baby blue", "yarn-light-blue.jpg"),
    ("soft purple", "yarn-mix-purple.jpg"),
    ("grey", "grey-yarn.jpg"),
    ("cream", "cream-yarn.png"),
]

GARMENT_SAMPLES = [
    ("cardigan", "garment-cardigan.jpg"),
    ("beanie", "garment-green-beanie.jpg"),
    ("socks", "garment-red-socks.jpg"),
    ("blanket", "garment-black-blanket.jpg"),
    ("baby knit", "garment-baby.jpg"),
]

# Default extraction parameters mirror what the live API uses for sample yarns.
N_COLORS = 10

# Output paths.
REPO_ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = REPO_ROOT / "chromaknit-frontend" / "public" / "samples"
OUTPUT_DIR = SAMPLES_DIR / "precomputed"
YARN_OUT_DIR = OUTPUT_DIR / "yarns"
GARMENT_OUT_DIR = OUTPUT_DIR / "garments"


def slugify(label: str) -> str:
    """Convert a human label to a filesystem-safe slug used by the frontend."""
    return label.lower().replace(" ", "-")


def precompute_yarn(label: str, filename: str) -> None:
    src = SAMPLES_DIR / filename
    if not src.exists():
        raise FileNotFoundError(f"Yarn sample missing: {src}")

    extractor = ColorExtractor(image_path=str(src), n_colors=N_COLORS)
    palette = extractor.extract_dominant_colors()
    if not palette:
        raise RuntimeError(f"ColorExtractor returned no colours for {src}")

    total = float(extractor.counts.sum())
    percentages = [round(float(c) / total, 4) for c in extractor.counts]

    out_path = YARN_OUT_DIR / f"{slugify(label)}.json"
    out_path.write_text(
        json.dumps(
            {
                "label": label,
                "palette": palette,
                "percentages": percentages,
            },
            indent=2,
        )
    )
    print(f"  yarn: {label:<14}  palette={len(palette)} colours  -> {out_path.name}")


def compute_brightness_range(image_bgr: np.ndarray, mask: np.ndarray) -> dict:
    """2nd / 98th percentile V over foreground pixels, matching the JS port.

    V here is max(R, G, B) per pixel, identical to OpenCV's V channel and to
    `computeGarmentBrightnessRange` in chromaknit-frontend/src/lib/recolourLocal.ts.
    Computing it in Python and shipping it as static metadata avoids the
    frontend having to load the original image into a canvas just to measure
    brightness.
    """
    foreground = mask >= 128
    v_per_pixel = image_bgr.max(axis=2)
    fg_v = v_per_pixel[foreground]
    if fg_v.size == 0:
        return {"minV": 0.0, "maxV": 255.0}
    return {
        "minV": float(np.percentile(fg_v, 2)),
        "maxV": float(np.percentile(fg_v, 98)),
    }


def precompute_garment(label: str, filename: str) -> None:
    src = SAMPLES_DIR / filename
    if not src.exists():
        raise FileNotFoundError(f"Garment sample missing: {src}")

    recolorer = GarmentRecolorer(garment_image_path=str(src))
    if not recolorer.prepare():
        raise RuntimeError(f"GarmentRecolorer.prepare() failed for {src}")

    height, width = recolorer.image.shape[:2]
    brightness_range = compute_brightness_range(recolorer.image, recolorer.mask)

    slug = slugify(label)
    mask_path = GARMENT_OUT_DIR / f"{slug}-mask.png"
    json_path = GARMENT_OUT_DIR / f"{slug}.json"

    if not cv2.imwrite(str(mask_path), recolorer.mask):
        raise RuntimeError(f"Failed to write mask to {mask_path}")

    json_path.write_text(
        json.dumps(
            {
                "label": label,
                "width": int(width),
                "height": int(height),
                "brightnessRange": brightness_range,
                "maskPath": f"/samples/precomputed/garments/{slug}-mask.png",
            },
            indent=2,
        )
    )
    print(
        f"  garment: {label:<10}  {width}x{height}  "
        f"V range {brightness_range['minV']:.0f}-{brightness_range['maxV']:.0f}  "
        f"-> {json_path.name}"
    )


def main() -> None:
    YARN_OUT_DIR.mkdir(parents=True, exist_ok=True)
    GARMENT_OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Precomputing yarn samples...")
    for label, filename in YARN_SAMPLES:
        precompute_yarn(label, filename)

    print()
    print("Precomputing garment samples (rembg, this is the slow part)...")
    for label, filename in GARMENT_SAMPLES:
        precompute_garment(label, filename)

    print()
    print(f"Done. Outputs in {OUTPUT_DIR.relative_to(REPO_ROOT)}")
    print(
        "Commit the changes under chromaknit-frontend/public/samples/precomputed/. "
        "These ship as static assets and are read by the frontend on sample clicks."
    )


if __name__ == "__main__":
    main()
