"""
ChromaKnit - Garment recolorer
Recolors input garment

Author: Joyce Chong
Date: 2025-11-07
"""

import cv2
import numpy as np
from rembg import remove


class GarmentRecolorer:
    def __init__(self, garment_image_path):
        self.garment_image_path = garment_image_path
        self.image = None
        self.mask = None  # for segmentation
        self.recolored_image = None
        self.image_no_bg = None
    
    def load_image(self):
        """
        Load an image from disk.
        
        Returns:
            bool: True if successful, False otherwise
        """
        self.image = cv2.imread(self.garment_image_path)
        
        if self.image is None:
            print(f"Error: Could not read image from {self.garment_image_path}")
            return False
        
        return True


    def remove_background(self):
        """
        Remove background from garment image using rembg.
        Creates a mask showing where the garment is.
        
        Returns:
            bool: True if successful, False otherwise
        """
        if self.image is None:
            print("Error: No image loaded. Call load_image() first.")
            return False
        
        try:
            # Remove background (returns RGBA image)
            # ie. a Red sweater on transparent background
            self.image_no_bg = remove(self.image)
            
            # Extract alpha channel as mask (garment=255, background=0)
            # ie. White garment shape on black background
            self.mask = self.image_no_bg[:, :, 3]
            
            return True
            
        except Exception as e:
            print(f"Error removing background: {e}")
            return False
    
    def hex_to_bgr(self, hex_color):
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return (b, g, r)   


    def apply_colors(self, target_colors):
        """
        Apply target colors to the garment.
        
        Args:
            target_colors (list): List of hex color codes (e.g., ['#FF0000'])
        
        Returns:
            bool: True if successful, False otherwise
        """
        # Step 1: Check if we have image and mask
        if self.image is None or self.mask is None:
            print("Error: Need image and mask first")
            return False
        
        # Step 2: Convert first hex color to BGR
        target_color = target_colors[0]  # Use first color
        bgr_color = self.hex_to_bgr(target_color)
        
        # Step 3: Create a copy of original image
        self.recolored_image = self.image.copy()
        
        # Step 4: Replace garment pixels (where mask > 0) with target color
        self.recolored_image[self.mask > 0] = bgr_color
        
        return True

    
    def save_result(self, output_path):
        """
        Save the recolored garment image to disk.
        
        Args:
            output_path (str): Path where to save the image
            
        Returns:
            bool: True if successful, False otherwise
        """
        if self.recolored_image is None:
            print("Error: No recolored image to save")
            return False
        
        # Try to save and check if successful
        success = cv2.imwrite(output_path, self.recolored_image)
        
        if success:
            print(f"✓ Recolored image saved to {output_path}")
            return True
        else:
            print(f"❌ Error: Failed to save image to {output_path}")
            return False


    def recolor_garment(self, target_colors):
        """
            Main orchestrator method to recolor a garment.
            Loads image, removes background, applies colors.
            
            Args:
                target_colors (list): List of hex color codes to apply
                
            Returns:
                numpy.ndarray: Recolored image, or None if failed
        """
        print("\n" + "="*60)
        print("CHROMAKNIT - GARMENT RECOLORING")
        print("="*60)
        
        print("\n--- Step 1: Loading image ---")
        if not self.load_image():
            return None
        print("✓ Image loaded")
        
        print("\n--- Step 2: Removing background ---")
        if not self.remove_background():
            return None
        print("✓ Background removed")
        
        print("\n--- Step 3: Applying colors ---")
        if not self.apply_colors(target_colors):
            return None
        print(f"✓ Applied color: {target_colors[0]}")
        
        print("\n" + "="*60)
        print("✓ Recoloring complete!")
        print("="*60 + "\n")
        
        return self.recolored_image