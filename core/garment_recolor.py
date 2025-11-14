"""
ChromaKnit - Garment recolorer
Recolors input garment

Author: Joyce Chong
Date: 2025-11-07
"""

import cv2
import numpy as np
from pathlib import Path
from rembg import remove
from core.utils import load_image, hex_to_bgr, print_header, print_step, print_success


class GarmentRecolorer:
    def __init__(self, garment_image_path):
        self.garment_image_path = Path(garment_image_path)
        self.image = None
        self.mask = None
        self.recolored_image = None
        self.image_no_bg = None

    def load_image(self) -> bool:
        """Load an image from disk."""
        self.image = load_image(str(self.garment_image_path))
        return self.image is not None

    def remove_background(self) -> bool:
        """Remove background from garment image using rembg."""
        if self.image is None:
            print("Error: No image loaded. Call load_image() first.")
            return False

        try:
            self.image_no_bg = remove(self.image)
            self.mask = self.image_no_bg[:, :, 3]
            return True
        except Exception as e:
            print(f"Error removing background: {e}")
            return False

    def _hex_colors_to_hsv(self, hex_colors: list[str]) -> list[np.ndarray]:
        """Convert hex color codes to HSV and sort by brightness."""
        hsv_colors = []
        for hex_color in hex_colors:
            bgr = hex_to_bgr(hex_color)
            pixel = np.uint8([[bgr]])
            hsv = cv2.cvtColor(pixel, cv2.COLOR_BGR2HSV)[0][0]
            hsv_colors.append(hsv)
        
        return sorted(hsv_colors, key=lambda x: x[2])

    def _get_color_mapping(self, brightness_values: np.ndarray, num_colors: int) -> np.ndarray:
        """Map brightness values to color indices."""
        if len(brightness_values) == 0:
            return np.array([], dtype=int)
        
        min_b, max_b = brightness_values.min(), brightness_values.max()
        
        if max_b > min_b:
            normalized = (brightness_values - min_b) / (max_b - min_b)
            return (normalized * (num_colors - 1)).astype(int)
        
        return np.zeros(len(brightness_values), dtype=int)

    def _apply_hsv_recoloring(self, image_hsv: np.ndarray, target_hsv: list, 
                              color_indices: np.ndarray, garment_mask: np.ndarray) -> np.ndarray:
        """Apply HSV recoloring to garment pixels."""
        recolored_hsv = image_hsv.copy()
        y_coords, x_coords = np.where(garment_mask)
        
        for color_idx, hsv_color in enumerate(target_hsv):
            pixels_mask = color_indices == color_idx
            y_for_color = y_coords[pixels_mask]
            x_for_color = x_coords[pixels_mask]
            
            recolored_hsv[y_for_color, x_for_color, :2] = hsv_color[:2]
        
        return recolored_hsv

    def apply_colors(self, target_colors: list[str]) -> bool:
        """Apply multiple target colors based on brightness."""
        if self.image is None or self.mask is None:
            print("Error: Need image and mask first")
            return False

        # Convert and sort colors by brightness
        target_hsv_colors = self._hex_colors_to_hsv(target_colors)
        
        # Convert image to HSV
        image_hsv = cv2.cvtColor(self.image, cv2.COLOR_BGR2HSV).astype(np.float32)
        
        # Get garment pixels and their brightness
        garment_mask = self.mask > 0
        brightness_values = image_hsv[garment_mask, 2]
        
        # Map brightness to colors
        color_indices = self._get_color_mapping(brightness_values, len(target_hsv_colors))
        
        # Apply recoloring
        recolored_hsv = self._apply_hsv_recoloring(image_hsv, target_hsv_colors, 
                                                    color_indices, garment_mask)
        
        # Convert back to BGR
        self.recolored_image = cv2.cvtColor(recolored_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
        
        print(f"✓ Applied {len(target_hsv_colors)} colors")
        return True

    def save_result(self, output_path: str) -> bool:
        """Save the recolored garment image to disk."""
        if self.recolored_image is None:
            print("Error: No recolored image to save")
            return False

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        success = cv2.imwrite(str(output_path), self.recolored_image)
        
        if success:
            print(f"✓ Recolored image saved to {output_path}")
            return True
        else:
            print(f"❌ Error: Failed to save image to {output_path}")
            return False

    def recolor_garment(self, target_colors: list[str]) -> np.ndarray | None:
        """Main orchestrator method to recolor a garment."""
        print_header("CHROMAKNIT - GARMENT RECOLORING")
        
        steps = [
            (1, "Loading image", self.load_image),
            (2, "Removing background", self.remove_background),
            (3, "Applying colors", lambda: self.apply_colors(target_colors)),
        ]
        
        for step_num, description, action in steps:
            print_step(step_num, description)
            if not action():
                return None
            print_success(description.lower())
        
        print_header("✓ Recoloring complete!")
        return self.recolored_image