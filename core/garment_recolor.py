"""
ChromaKnit - Garment recolorer
Recolors input garment

Author: Joyce Chong
Date: 2025-11-07
"""

import cv2
import numpy as np
from pathlib import Path
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
            # Lazy import to reduce memory at startup
            from rembg import remove, new_session
            session = new_session("u2netp")
            self.image_no_bg = remove(self.image, session=session)
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

    def _get_color_mapping(self, brightness_values: np.ndarray, num_colors: int,
                           weights: list[float] | None = None) -> np.ndarray:
        """Map brightness values to color indices using distribution weights.

        Sorts garment pixels by brightness and assigns them to yarn colors
        proportionally based on the yarn's actual color distribution.
        """
        if len(brightness_values) == 0:
            return np.array([], dtype=int)

        if weights is None or len(weights) != num_colors:
            min_b, max_b = brightness_values.min(), brightness_values.max()
            if max_b > min_b:
                normalized = (brightness_values - min_b) / (max_b - min_b)
                return (normalized * (num_colors - 1)).astype(int)
            return np.zeros(len(brightness_values), dtype=int)

        sorted_indices = np.argsort(brightness_values)
        total_pixels = len(brightness_values)
        color_indices = np.zeros(total_pixels, dtype=int)

        cumulative = 0.0
        pixel_start = 0
        for color_idx, weight in enumerate(weights):
            cumulative += weight
            pixel_end = int(round(cumulative * total_pixels))
            pixel_end = min(pixel_end, total_pixels)
            color_indices[sorted_indices[pixel_start:pixel_end]] = color_idx
            pixel_start = pixel_end

        return color_indices

    def _apply_hsv_recoloring(self, image_hsv: np.ndarray, target_hsv: list,
                              color_indices: np.ndarray, garment_mask: np.ndarray) -> np.ndarray:
        """Apply HSV recoloring by remapping garment brightness to yarn brightness range.

        For each color band, the garment pixels' brightness is remapped from the
        garment's range to the yarn color's range. This preserves relative texture
        (folds stay darker than flat areas) while shifting absolute brightness to
        match the yarn. A dark yarn makes a dark garment. A bright yarn makes a
        bright garment.
        """
        recolored_hsv = image_hsv.copy()
        y_coords, x_coords = np.where(garment_mask)

        # Get the full garment brightness range for remapping
        all_v = image_hsv[garment_mask, 2]
        garment_min_v = float(np.percentile(all_v, 2))   # use percentiles to avoid outliers
        garment_max_v = float(np.percentile(all_v, 98))
        garment_range = garment_max_v - garment_min_v
        if garment_range < 1:
            garment_range = 1.0

        # Get the yarn's overall brightness range from all target colors
        yarn_min_v = float(min(c[2] for c in target_hsv))
        yarn_max_v = float(max(c[2] for c in target_hsv))

        for color_idx, hsv_color in enumerate(target_hsv):
            pixels_mask = color_indices == color_idx
            y_for_color = y_coords[pixels_mask]
            x_for_color = x_coords[pixels_mask]

            # Replace hue and saturation from yarn
            recolored_hsv[y_for_color, x_for_color, 0] = hsv_color[0]
            recolored_hsv[y_for_color, x_for_color, 1] = hsv_color[1]

            # Remap brightness: garment range → yarn range
            # Normalize pixel position within garment's range (0.0 = darkest, 1.0 = brightest)
            original_v = recolored_hsv[y_for_color, x_for_color, 2]
            normalized = (original_v - garment_min_v) / garment_range
            normalized = np.clip(normalized, 0.0, 1.0)

            # Map to yarn range, centered around this color's brightness
            # Allow texture variation of ±spread around the target V
            target_v = float(hsv_color[2])
            spread = (yarn_max_v - yarn_min_v) * 0.15  # 15% of yarn range for texture
            low_v = max(0, target_v - spread)
            high_v = min(255, target_v + spread)

            remapped_v = low_v + normalized * (high_v - low_v)
            recolored_hsv[y_for_color, x_for_color, 2] = np.clip(remapped_v, 0, 255)

        return recolored_hsv

    def apply_colors(self, target_colors: list[str], weights: list[float] | None = None) -> bool:
        """Apply multiple target colors based on brightness, weighted by distribution.

        Args:
            target_colors: Hex color codes sorted by frequency (most common first).
            weights: Percentage of each color (0.0-1.0), same order as target_colors.
                     If provided, garment pixels are distributed proportionally.
        """
        if self.image is None or self.mask is None:
            print("Error: Need image and mask first")
            return False

        # Convert colors to HSV sorted by brightness (dark to bright)
        # We need to sort weights alongside colors
        hsv_colors = []
        for hex_color in target_colors:
            bgr = hex_to_bgr(hex_color)
            pixel = np.uint8([[bgr]])
            hsv = cv2.cvtColor(pixel, cv2.COLOR_BGR2HSV)[0][0]
            hsv_colors.append(hsv)

        # Sort by brightness, keeping weights aligned
        if weights and len(weights) == len(hsv_colors):
            paired = sorted(zip(hsv_colors, weights), key=lambda x: x[0][2])
            target_hsv_colors = [p[0] for p in paired]
            sorted_weights = [p[1] for p in paired]
        else:
            target_hsv_colors = sorted(hsv_colors, key=lambda x: x[2])
            sorted_weights = None

        # Convert image to HSV
        image_hsv = cv2.cvtColor(self.image, cv2.COLOR_BGR2HSV).astype(np.float32)

        # Get garment pixels and their brightness
        garment_mask = self.mask > 0
        brightness_values = image_hsv[garment_mask, 2]

        # Map brightness to colors using distribution weights
        color_indices = self._get_color_mapping(brightness_values, len(target_hsv_colors),
                                                sorted_weights)

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

    def recolor_garment(self, target_colors: list[str], weights: list[float] | None = None) -> np.ndarray | None:
        """Main orchestrator method to recolor a garment."""
        print_header("CHROMAKNIT - GARMENT RECOLORING")

        steps = [
            (1, "Loading image", self.load_image),
            (2, "Removing background", self.remove_background),
            (3, "Applying colors", lambda: self.apply_colors(target_colors, weights)),
        ]
        
        for step_num, description, action in steps:
            print_step(step_num, description)
            if not action():
                return None
            print_success(description.lower())
        
        print_header("✓ Recoloring complete!")
        return self.recolored_image