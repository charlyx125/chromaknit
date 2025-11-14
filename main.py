"""
ChromaKnit - Main Execution Script
Demonstrates yarn color extraction and garment recoloring.

Author: Joyce Chong
Date: 2025-11-07
"""

from core.yarn_color_extractor import ColorExtractor
from core.garment_recolor import GarmentRecolorer
from core.utils import print_header, print_step, print_success


def main():
    """
    Main execution function demonstrating the full ChromaKnit workflow:
    1. Extract colors from yarn photo
    2. Recolor a garment with those colors
    """
    print_header("CHROMAKNIT - FULL WORKFLOW DEMO")
    
    # ========== STEP 1: Extract colors from yarn ==========
    print_step(1, "Extracting colors from yarn photo")
    
    YARN_IMAGE_PATH = "examples/sample-yarn.jpg"
    N_COLORS = 5
    YARN_OUTPUT_PATH = "results/yarn_colors.png"
    
    extractor = ColorExtractor(image_path=YARN_IMAGE_PATH, n_colors=N_COLORS)
    yarn_colors = extractor.extract_dominant_colors()
    
    if not yarn_colors:
        print("\n❌ Color extraction failed. Please check the yarn image path.")
        return
    
    extractor.visualize_colors(output_path=YARN_OUTPUT_PATH)
    print_success(f"Yarn colors saved to: {YARN_OUTPUT_PATH}")
    
    
    # ========== STEP 2: Recolor garment with extracted colors ==========
    print_step(2, "Recoloring garment with yarn colors")
    
    GARMENT_IMAGE_PATH = "examples/sample-garment.jpg"
    RECOLORED_OUTPUT_PATH = "results/recolored_garment.png"

    recolorer = GarmentRecolorer(garment_image_path=GARMENT_IMAGE_PATH)
    recolored_image = recolorer.recolor_garment(target_colors=yarn_colors)
    
    if recolored_image is None:
        print("\n❌ Garment recoloring failed. Please check the garment image path.")
        return
    
    recolorer.save_result(output_path=RECOLORED_OUTPUT_PATH)
    
    
    # ========== SUMMARY ==========
    print_header("✓ CHROMAKNIT WORKFLOW COMPLETE!")
    
    print_success(f"Yarn colors: {YARN_OUTPUT_PATH}")
    print_success(f"Recolored garment: {RECOLORED_OUTPUT_PATH}")
    print_success(f"Applied color: {yarn_colors[0]}")
    
    print("\n💡 To use your own images:")
    print("   1. Add yarn photo to examples/ folder")
    print("   2. Add garment photo to examples/ folder")
    print("   3. Update paths in this script")
    print("   4. Run: python main.py\n")


if __name__ == "__main__":
    main()