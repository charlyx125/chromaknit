"""
ChromaKnit - Yarn Color Extractor
Extracts dominant colors from yarn photos using K-means clustering.

Author: Joyce Chong
Date: 2025-11-07
"""

import cv2
import numpy as np
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def load_image(image_path):
    """
    Load an image from disk.
    
    Args:
        image_path (str): Path to the image file
        
    Returns:
        numpy.ndarray: Image in BGR format, or None if loading failed
    """
    image = cv2.imread(image_path)
    
    if image is None:
        print(f"❌ Error: Could not read image from {image_path}")
        return None
    
    print(f"✓ Image loaded successfully!")
    print(f"  Shape: {image.shape}")
    print(f"  Size: {image.shape[0] * image.shape[1]:,} pixels")
    return image


def convert_bgr_to_rgb(image):
    """
    Convert image from BGR (OpenCV default) to RGB.
    
    Args:
        image (numpy.ndarray): Image in BGR format
        
    Returns:
        numpy.ndarray: Image in RGB format
    """
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def rgb_to_hex(rgb_tuple):
    """
    Convert RGB color to hex code.
    
    Args:
        rgb_tuple (tuple): RGB values (0-255 each)
        
    Returns:
        str: Hex color code (e.g., '#FF5733')
    """
    return '#%02x%02x%02x' % tuple(rgb_tuple)


# ============================================================================
# MAIN COLOR EXTRACTION FUNCTION
# ============================================================================

def extract_dominant_colors(image_path, n_colors=5, output_path='results/yarn_colors.png'):
    """
    Extract dominant colors from a yarn image.
    
    Args:
        image_path (str): Path to the yarn image
        n_colors (int): Number of dominant colors to extract
        output_path (str): Where to save the visualization
        
    Returns:
        list: List of hex color codes, sorted by frequency (most common first)
    """
    
    # Step 1: Load image
    print("\n" + "="*60)
    print("CHROMAKNIT - YARN COLOR EXTRACTION")
    print("="*60)
    
    image = load_image(image_path)
    if image is None:
        return None
    
    
    # Step 2: Convert BGR to RGB
    print(f"\n--- Step 1: Converting color space ---")
    image_rgb = convert_bgr_to_rgb(image)
    print("✓ Converted from BGR to RGB")
    
    
    # Step 3: Reshape for K-means
    print(f"\n--- Step 2: Reshaping image ---")
    pixels = image_rgb.reshape(-1, 3)
    total_pixels = pixels.shape[0]
    print(f"Original shape: {image_rgb.shape} (height x width x channels)")
    print(f"Reshaped to: {pixels.shape} (total_pixels x channels)")
    print(f"Total pixels: {total_pixels:,}")
    
    
    # Step 4: K-means clustering
    print(f"\n--- Step 3: Running K-means clustering ---")
    print(f"Finding {n_colors} dominant colors...")
    
    kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=10)
    kmeans.fit(pixels)
    
    print("✓ K-means complete!")
    
    
    # Step 5: Sort colors by frequency
    print(f"\n--- Step 4: Analyzing results ---")
    
    unique_labels, counts = np.unique(kmeans.labels_, return_counts=True)
    
    # Sort by frequency (most common first)
    sorted_indices = np.argsort(-counts)
    sorted_labels = unique_labels[sorted_indices]
    sorted_counts = counts[sorted_indices]
    sorted_colors = kmeans.cluster_centers_[sorted_labels].astype(int)
    
    # Convert to hex codes
    hex_codes = [rgb_to_hex(color) for color in sorted_colors]
    
    # Print results table
    print(f"\n{'Rank':<6} {'Cluster':<9} {'Pixels':<12} {'%':<8} {'Hex Code'}")
    print("-" * 60)
    for i, (label, count, hex_code) in enumerate(zip(sorted_labels, sorted_counts, hex_codes), 1):
        percentage = (count / total_pixels) * 100
        print(f"{i:<6} {label:<9} {count:>10,} {percentage:>6.2f}% {hex_code}")
    
    
    # Step 6: Visualize
    print(f"\n--- Step 5: Creating visualization ---")
    visualize_colors(image_rgb, hex_codes, sorted_counts, total_pixels, output_path)
    print(f"✓ Visualization saved to: {output_path}")
    
    
    # Summary
    print(f"\n" + "="*60)
    print(f"🎨 EXTRACTED {n_colors} DOMINANT COLORS:")
    for i, hex_code in enumerate(hex_codes, 1):
        print(f"   {i}. {hex_code}")
    print("="*60 + "\n")
    
    return hex_codes


# ============================================================================
# VISUALIZATION
# ============================================================================

def visualize_colors(image_rgb, hex_codes, counts, total_pixels, output_path):
    """
    Create a side-by-side visualization of the image and extracted colors.
    
    The visualization uses overlapping axes so the color palette appears
    to "touch" the yarn image, creating a cohesive design.
    
    Args:
        image_rgb (numpy.ndarray): Original image in RGB
        hex_codes (list): List of hex color codes
        counts (list): Pixel counts for each color
        total_pixels (int): Total number of pixels
        output_path (str): Where to save the figure
    """
    # Create figure
    fig = plt.figure(figsize=(12, 6))
    
    # Create overlapping axes
    # ax1: Image takes 68% width, starting at 5% from left
    ax1 = plt.axes([0.05, 0.1, 0.68, 0.8])
    
    # ax2: Colors start at 55% (overlaps with image by ~13%)
    ax2 = plt.axes([0.50, 0.1, 0.50, 0.8])
    
    # Display yarn image on the left
    ax1.imshow(image_rgb)
    ax1.set_title('Original Yarn Image', fontsize=14, fontweight='bold', pad=10)
    ax1.axis('off')
    
    # Display color palette on the right
    for i, (hex_code, count) in enumerate(zip(hex_codes, counts)):
        percentage = (count / total_pixels) * 100
        
        # Draw colored rectangle
        ax2.add_patch(plt.Rectangle((0, i), 1, 1, color=hex_code))
        
        # Add text with color code and percentage
        ax2.text(0.5, i + 0.5, f'{hex_code}\n({percentage:.1f}%)', 
                ha='center', va='center', 
                fontsize=11, color='white', weight='bold',
                bbox=dict(boxstyle='round', facecolor='black', alpha=0.3))
    
    # Configure color palette axis
    ax2.set_xlim(0, 1)
    ax2.set_ylim(0, len(hex_codes))
    ax2.set_title('Extracted Colors\n(sorted by frequency)', 
                  fontsize=14, fontweight='bold', pad=10)
    ax2.axis('off')
    ax2.invert_yaxis()  # Most common color at top
    
    # Save with high resolution
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    print(f"✓ Saved visualization with overlapping layout")


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    # Configuration
    # Default: uses example photo (so anyone can test immediately)
    # To use your own: copy photo to photos/ folder and update IMAGE_PATH below
    IMAGE_PATH = "examples/sample-yarn.jpg"
    N_COLORS = 5
    OUTPUT_PATH = "results/yarn_colors.png"
    
    # Extract colors
    colors = extract_dominant_colors(
        image_path=IMAGE_PATH,
        n_colors=N_COLORS,
        output_path=OUTPUT_PATH
    )
    
    if colors:
        print("\n✓ Success! Check the results/ folder for your visualization.")
        print("\n💡 To use your own yarn photo:")
        print("   1. Copy your photo to photos/ folder")
        print("   2. Update IMAGE_PATH in this script (line 198)")
        print("   3. Run again: python yarn_color_extractor.py")
    else:
        print("\n❌ Extraction failed. Please check the image path.")