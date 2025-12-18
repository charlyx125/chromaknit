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
from matplotlib.patches import Rectangle
from core.utils import load_image, convert_bgr_to_rgb, rgb_to_hex, print_header, print_step, print_success

class ColorExtractor:
    """
    Extracts dominant colors from yarn images using K-means clustering.
    
    Attributes:
        image_path (str): Path to the yarn image file
        n_colors (int): Number of dominant colors to extract
        image (numpy.ndarray): Loaded image in BGR format
        image_rgb (numpy.ndarray): Image converted to RGB format
        hex_codes (list): Extracted color hex codes
        counts (numpy.ndarray): Pixel counts for each color
    """
    
    def __init__(self, image_path, n_colors=5):
        """
        Initialize the ColorExtractor.
        
        Args:
            image_path (str): Path to the yarn image file
            n_colors (int): Number of dominant colors to extract (default: 5)
        """
        self.image_path = image_path
        self.n_colors = n_colors
        self.image = None
        self.image_rgb = None
        self.hex_codes = None
        self.counts = None
    
    def load_image(self):
        """
        Load an image from disk using utility function.
        
        Returns:
            bool: True if successful, False otherwise
        """
        self.image = load_image(self.image_path)
        return self.image is not None
    
    def convert_bgr_to_rgb(self):
        """
        Convert the loaded image from BGR to RGB using utility function.
        
        Returns:
            bool: True if successful, False if no image loaded
        """
        self.image_rgb = convert_bgr_to_rgb(self.image)
        return self.image_rgb is not None
    
    
    def _preprocess_image(self):
        """
        Load and convert image to RGB format.
        
        Returns:
            bool: True if successful, False otherwise
        """
        print_step(1, "Loading and converting image")
        
        if not self.load_image():
            return False
        
        if not self.convert_bgr_to_rgb():
            return False
        
        print_success("Image loaded and converted to RGB")
        return True
    
    
    def _reshape_for_clustering(self):
        """
        Reshape image into a 2D array of pixels for K-means clustering.
        
        Returns:
            numpy.ndarray: Reshaped pixel array (total_pixels x 3)
        """
        print_step(2, "Reshaping image")

        if self.image_rgb is None:
            raise ValueError("Image not loaded. Call _preprocess_image() first.")
    
        pixels = self.image_rgb.reshape(-1, 3)
        total_pixels = pixels.shape[0]
        
        print(f"Original shape: {self.image_rgb.shape} (height x width x channels)")
        print(f"Reshaped to: {pixels.shape} (total_pixels x channels)")
        print(f"Total pixels: {total_pixels:,}")
        
        return pixels
    
    def _cluster_colors(self, pixels):
        """
        Perform K-means clustering to find dominant colors.
        
        Args:
            pixels (numpy.ndarray): Reshaped pixel array
            
        Returns:
            KMeans: Fitted K-means model
        """
        print_step(3, "Running K-means clustering")
        print(f"Finding {self.n_colors} dominant colors...")
        
        kmeans = KMeans(n_clusters=self.n_colors, random_state=42, n_init=10)
        kmeans.fit(pixels)
        
        print_success("K-means complete!")
        return kmeans
    
    def _sort_by_frequency(self, kmeans):
        """
        Sort cluster colors by frequency (most common first).
        
        Args:
            kmeans (KMeans): Fitted K-means model
        """
        print_step(4, "Sorting colors by frequency")
        
        unique_labels, counts = np.unique(kmeans.labels_, return_counts=True)
        
        # Sort by frequency (descending)
        sorted_indices = np.argsort(-counts)
        sorted_labels = unique_labels[sorted_indices]
        self.counts = counts[sorted_indices]
        sorted_colors = kmeans.cluster_centers_[sorted_labels].astype(int)
        
        # Convert to hex codes
        self.hex_codes = [rgb_to_hex(color) for color in sorted_colors]
        
        print_success("Colors sorted by frequency")
        
    
    def _print_results(self):
        """
        Print extraction results in a formatted table.
        """
        if self.image_rgb is None:
            raise ValueError("Image not loaded. Call _preprocess_image() first.")
    
        if self.hex_codes is None or self.counts is None:
            raise ValueError("No colors extracted yet. Run clustering first.")

        total_pixels = self.image_rgb.shape[0] * self.image_rgb.shape[1]
        
        print(f"\n{'Rank':<6} {'Pixels':<12} {'%':<8} {'Hex Code'}")
        print("-" * 40)
        
        for i, (count, hex_code) in enumerate(zip(self.counts, self.hex_codes), 1):
            percentage = (count / total_pixels) * 100
            print(f"{i:<6} {count:>10,} {percentage:>6.2f}% {hex_code}")
        
        print(f"\n" + "="*60)
        print(f"🎨 EXTRACTED {self.n_colors} DOMINANT COLORS:")
        for i, hex_code in enumerate(self.hex_codes, 1):
            print(f"   {i}. {hex_code}")
        print("="*60 + "\n")
    
    def extract_dominant_colors(self):
        """
        Extract dominant colors from the yarn image.
        
        This is the main orchestration method that coordinates all steps:
        1. Preprocess image (load and convert)
        2. Reshape for clustering
        3. Run K-means clustering
        4. Sort by frequency
        5. Print results
        
        Returns:
            list: List of hex color codes, sorted by frequency (most common first),
                or None if extraction failed
        """
        print_header("CHROMAKNIT - YARN COLOR EXTRACTION")
        
        # Preprocess
        if not self._preprocess_image():
            return None
        
        # Reshape
        pixels = self._reshape_for_clustering()
        
        # Cluster
        kmeans = self._cluster_colors(pixels)
        
        # Sort and convert
        self._sort_by_frequency(kmeans)
        
        # Display
        self._print_results()
        
        return self.hex_codes

    
    def visualize_colors(self, output_path='results/yarn_colors.png'):
        """
        Create a side-by-side visualization of the image and extracted colors.
        
        The visualization uses overlapping axes so the color palette appears
        to "touch" the yarn image, creating a cohesive design.
        
        Args:
            output_path (str): Where to save the figure
            
        Returns:
            bool: True if successful, False otherwise
        """
        if self.image_rgb is None or self.hex_codes is None or self.counts is None:
            print("❌ Error: No colors extracted yet. Call extract_dominant_colors() first.")
            return False
        
        print_step(5, "Creating visualization")
        
        total_pixels = self.image_rgb.shape[0] * self.image_rgb.shape[1]
        
        # Create figure
        fig = plt.figure(figsize=(12, 6))
        
        # Create overlapping axes
        # ax1: Image takes 68% width, starting at 5% from left
        ax1 = plt.axes((0.05, 0.1, 0.68, 0.8))
        
        # ax2: Colors start at 55% (overlaps with image by ~13%)
        ax2 = plt.axes((0.50, 0.1, 0.50, 0.8))
        
        # Display yarn image on the left
        ax1.imshow(self.image_rgb)
        ax1.set_title('Original Yarn Image', fontsize=14, fontweight='bold', pad=10)
        ax1.axis('off')
        
        # Display color palette on the right
        for i, (hex_code, count) in enumerate(zip(self.hex_codes, self.counts)):
            percentage = (count / total_pixels) * 100
            
            # Draw colored rectangle
            ax2.add_patch(Rectangle((0, i), 1, 1, color=hex_code))
            
            # Add text with color code and percentage
            ax2.text(0.5, i + 0.5, f'{hex_code}\n({percentage:.1f}%)', 
                    ha='center', va='center', 
                    fontsize=11, color='white', weight='bold',
                    bbox=dict(boxstyle='round', facecolor='black', alpha=0.3))
        
        # Configure color palette axis
        ax2.set_xlim(0, 1)
        ax2.set_ylim(0, len(self.hex_codes))
        ax2.set_title('Extracted Colors\n(sorted by frequency)', 
                      fontsize=14, fontweight='bold', pad=10)
        ax2.axis('off')
        ax2.invert_yaxis()  # Most common color at top
        
        # Save with high resolution
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        
        print(f"✓ Visualization saved to: {output_path}")
        return True