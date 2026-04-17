"""ChromaKnit CLI demo — extract yarn colors and recolor a sample garment."""

from core.yarn_color_extractor import ColorExtractor
from core.garment_recolor import GarmentRecolorer


def banner(title: str) -> None:
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}")


def main() -> None:
    banner("CHROMAKNIT - FULL WORKFLOW DEMO")

    YARN_IMAGE_PATH = "examples/yarn/sample-yarn.jpg"
    GARMENT_IMAGE_PATH = "examples/garment/sample-garment.jpg"
    YARN_OUTPUT_PATH = "results/yarn_colors.png"
    RECOLORED_OUTPUT_PATH = "results/recolored_garment.png"
    N_COLORS = 5

    print(f"\n[1/2] Extracting {N_COLORS} colors from {YARN_IMAGE_PATH}")
    extractor = ColorExtractor(image_path=YARN_IMAGE_PATH, n_colors=N_COLORS)
    yarn_colors = extractor.extract_dominant_colors()

    if not yarn_colors:
        print(f"\nColor extraction failed. Check that {YARN_IMAGE_PATH} exists.")
        return

    extractor.visualize_colors(output_path=YARN_OUTPUT_PATH)
    print(f"    Yarn palette saved to {YARN_OUTPUT_PATH}")

    print(f"\n[2/2] Recoloring {GARMENT_IMAGE_PATH}")
    recolorer = GarmentRecolorer(garment_image_path=GARMENT_IMAGE_PATH)
    recolored_image = recolorer.recolor_garment(target_colors=yarn_colors)

    if recolored_image is None:
        print(f"\nRecoloring failed. Check that {GARMENT_IMAGE_PATH} exists.")
        return

    recolorer.save_result(output_path=RECOLORED_OUTPUT_PATH)

    banner("DONE")
    print(f"  palette:  {YARN_OUTPUT_PATH}")
    print(f"  garment:  {RECOLORED_OUTPUT_PATH}")
    print(f"  applied:  {', '.join(yarn_colors)}\n")


if __name__ == "__main__":
    main()
