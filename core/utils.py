"""Shared image and color utilities."""

import logging

import cv2

logger = logging.getLogger(__name__)


def load_image(image_path):
    """Load an image from disk in BGR format. Returns None on failure."""
    image = cv2.imread(image_path)
    if image is None:
        logger.error("could not read image", extra={"path": image_path})
        return None
    return image


def convert_bgr_to_rgb(image):
    """Convert a BGR image to RGB. Returns None if input is None."""
    if image is None:
        logger.error("no image provided for BGR to RGB conversion")
        return None
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def rgb_to_hex(rgb_tuple):
    """Convert an (R, G, B) tuple to a lowercase hex color code."""
    return "#%02x%02x%02x" % tuple(rgb_tuple)


def hex_to_bgr(hex_color):
    """Convert a hex color string to a BGR tuple (OpenCV order)."""
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (b, g, r)
