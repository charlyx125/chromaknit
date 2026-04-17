"""Extract dominant colors from yarn photos using K-means clustering."""

import logging

import cv2
import numpy as np
from sklearn.cluster import MiniBatchKMeans
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

from core.utils import load_image, convert_bgr_to_rgb, rgb_to_hex

logger = logging.getLogger(__name__)


class ColorExtractor:
    """Extracts dominant colors from yarn images using K-means clustering."""

    def __init__(self, image_path, n_colors=5):
        self.image_path = image_path
        self.n_colors = n_colors
        self.image = None
        self.image_rgb = None
        self.hex_codes = None
        self.counts = None

    def load_image(self):
        """Load an image from disk. Returns True on success."""
        self.image = load_image(self.image_path)
        return self.image is not None

    def convert_bgr_to_rgb(self):
        """Convert the loaded image from BGR to RGB. Returns True on success."""
        self.image_rgb = convert_bgr_to_rgb(self.image)
        return self.image_rgb is not None

    def _preprocess_image(self):
        if not self.load_image():
            return False
        if not self.convert_bgr_to_rgb():
            return False
        return True

    def _reshape_for_clustering(self):
        if self.image_rgb is None:
            raise ValueError("Image not loaded. Call _preprocess_image() first.")

        pixels = self.image_rgb.reshape(-1, 3)
        logger.debug(
            "reshaped image for clustering",
            extra={
                "original_shape": list(self.image_rgb.shape),
                "reshaped_shape": list(pixels.shape),
                "total_pixels": int(pixels.shape[0]),
            },
        )
        return pixels

    def _cluster_colors(self, pixels):
        kmeans = MiniBatchKMeans(
            n_clusters=self.n_colors, random_state=42, n_init=3, batch_size=1000
        )
        kmeans.fit(pixels)
        return kmeans

    def _sort_by_frequency(self, kmeans):
        unique_labels, counts = np.unique(kmeans.labels_, return_counts=True)
        sorted_indices = np.argsort(-counts)
        sorted_labels = unique_labels[sorted_indices]
        self.counts = counts[sorted_indices]
        sorted_colors = kmeans.cluster_centers_[sorted_labels].astype(int)
        self.hex_codes = [rgb_to_hex(color) for color in sorted_colors]

    def _log_results(self):
        if self.image_rgb is None:
            raise ValueError("Image not loaded. Call _preprocess_image() first.")
        if self.hex_codes is None or self.counts is None:
            raise ValueError("No colors extracted yet. Run clustering first.")

        total_pixels = self.image_rgb.shape[0] * self.image_rgb.shape[1]
        results = [
            {
                "rank": i,
                "hex": hex_code,
                "pixels": int(count),
                "percent": round(float(count) / total_pixels, 4),
            }
            for i, (count, hex_code) in enumerate(
                zip(self.counts, self.hex_codes), start=1
            )
        ]
        logger.info(
            "color extraction complete",
            extra={
                "n_colors": self.n_colors,
                "total_pixels": total_pixels,
                "results": results,
            },
        )

    def extract_dominant_colors(self):
        """Orchestrate the full extraction pipeline.

        Returns the hex codes sorted by frequency, or None if loading failed.
        """
        logger.info("starting yarn color extraction", extra={"n_colors": self.n_colors})

        if not self._preprocess_image():
            return None

        pixels = self._reshape_for_clustering()
        kmeans = self._cluster_colors(pixels)
        self._sort_by_frequency(kmeans)
        self._log_results()

        return self.hex_codes

    def visualize_colors(self, output_path="results/yarn_colors.png"):
        """Save a side-by-side visualization of the image and extracted colors.

        Returns True on success.
        """
        if self.image_rgb is None or self.hex_codes is None or self.counts is None:
            logger.error("no colors extracted; call extract_dominant_colors() first")
            return False

        total_pixels = self.image_rgb.shape[0] * self.image_rgb.shape[1]

        fig = plt.figure(figsize=(12, 6))
        ax1 = plt.axes((0.05, 0.1, 0.68, 0.8))
        ax2 = plt.axes((0.50, 0.1, 0.50, 0.8))

        ax1.imshow(self.image_rgb)
        ax1.set_title("Original Yarn Image", fontsize=14, fontweight="bold", pad=10)
        ax1.axis("off")

        for i, (hex_code, count) in enumerate(zip(self.hex_codes, self.counts)):
            percentage = (count / total_pixels) * 100
            ax2.add_patch(Rectangle((0, i), 1, 1, color=hex_code))
            ax2.text(
                0.5, i + 0.5, f"{hex_code}\n({percentage:.1f}%)",
                ha="center", va="center",
                fontsize=11, color="white", weight="bold",
                bbox=dict(boxstyle="round", facecolor="black", alpha=0.3),
            )

        ax2.set_xlim(0, 1)
        ax2.set_ylim(0, len(self.hex_codes))
        ax2.set_title(
            "Extracted Colors\n(sorted by frequency)",
            fontsize=14, fontweight="bold", pad=10,
        )
        ax2.axis("off")
        ax2.invert_yaxis()

        plt.savefig(output_path, dpi=300, bbox_inches="tight")
        plt.close()

        logger.info("visualization saved", extra={"path": output_path})
        return True
