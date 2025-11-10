"""
ChromaKnit - Main Execution Script
Run color extraction on yarn images.

Author: Joyce Chong
Date: 2025-11-07
"""

from core.yarn_color_extractor import ColorExtractor


def main():
    """
    Main execution function for color extraction.
    """
    # Configuration
    IMAGE_PATH = "examples/sample-yarn.jpg"
    N_COLORS = 5
    OUTPUT_PATH = "results/yarn_colors.png"
    
    # Create extractor and extract colors
    extractor = ColorExtractor(image_path=IMAGE_PATH, n_colors=N_COLORS)
    colors = extractor.extract_dominant_colors()
    
    if colors:
        extractor.visualize_colors(output_path=OUTPUT_PATH)
        print("\n✓ Success! Check the results/ folder for your visualization.")
        print("\n💡 To use your own yarn photo:")
        print("   1. Copy your photo to photos/ folder")
        print("   2. Update IMAGE_PATH in this script")
        print("   3. Run again: python main.py")
    else:
        print("\n❌ Extraction failed. Please check the image path.")


if __name__ == "__main__":
    main()