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
            result = remove(self.image)
            
            # Extract alpha channel as mask (garment=255, background=0)
            # ie. White garment shape on black background
            self.mask = result[:, :, 3]
            
            return True
            
        except Exception as e:
            print(f"Error removing background: {e}")
            return False
        

    def apply_colors(self, target_colors):
        pass
    
    def recolor_garment(self, target_colors):
        pass
    
    def save_result(self, output_path):
        pass
    