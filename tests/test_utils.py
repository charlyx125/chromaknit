"""
Unit tests for utility functions.

Run with: pytest tests/test_utils.py -v
"""

import pytest
import numpy as np
import cv2
from core.utils import (
    load_image, 
    convert_bgr_to_rgb, 
    rgb_to_hex, 
    hex_to_bgr,
    print_header,
    print_step,
    print_success
)


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def sample_image_path(tmp_path):
    """
    Create a temporary test image.
    """
    img = np.zeros((50, 50, 3), dtype=np.uint8)
    img[:, :] = [100, 150, 200]  # BGR values
    
    image_path = tmp_path / "test_image.jpg"
    cv2.imwrite(str(image_path), img)
    
    return str(image_path)


@pytest.fixture
def invalid_image_path():
    """
    Returns a path to a non-existent image.
    """
    return "path/to/nonexistent/image.jpg"


# ============================================================================
# LOAD IMAGE TESTS
# ============================================================================

def test_load_image_success(sample_image_path):
    """Test successful image loading."""
    image = load_image(sample_image_path)
    
    assert image is not None
    assert isinstance(image, np.ndarray)
    assert len(image.shape) == 3


def test_load_image_failure(invalid_image_path):
    """Test image loading with invalid path."""
    image = load_image(invalid_image_path)
    
    assert image is None


# ============================================================================
# BGR TO RGB CONVERSION TESTS
# ============================================================================

def test_convert_bgr_to_rgb_success(sample_image_path):
    """Test BGR to RGB conversion."""
    bgr_image = load_image(sample_image_path)
    rgb_image = convert_bgr_to_rgb(bgr_image)
    
    assert rgb_image is not None
    assert isinstance(rgb_image, np.ndarray)
    assert bgr_image.shape == rgb_image.shape


def test_convert_bgr_to_rgb_with_none():
    """Test BGR to RGB conversion with None input."""
    result = convert_bgr_to_rgb(None)
    
    assert result is None


def test_convert_bgr_to_rgb_channels_swapped(sample_image_path):
    """Test that BGR to RGB actually swaps channels."""
    bgr_image = load_image(sample_image_path)
    rgb_image = convert_bgr_to_rgb(bgr_image)
    
    # Blue and red channels should be swapped
    assert np.array_equal(bgr_image[:, :, 0], rgb_image[:, :, 2])
    assert np.array_equal(bgr_image[:, :, 2], rgb_image[:, :, 0])


# ============================================================================
# RGB TO HEX TESTS
# ============================================================================

def test_rgb_to_hex_pure_colors():
    """Test RGB to hex conversion with pure colors."""
    assert rgb_to_hex((255, 0, 0)) == "#ff0000"  # Red
    assert rgb_to_hex((0, 255, 0)) == "#00ff00"  # Green
    assert rgb_to_hex((0, 0, 255)) == "#0000ff"  # Blue
    assert rgb_to_hex((255, 255, 255)) == "#ffffff"  # White
    assert rgb_to_hex((0, 0, 0)) == "#000000"  # Black


def test_rgb_to_hex_mixed_colors():
    """Test RGB to hex conversion with mixed colors."""
    assert rgb_to_hex((255, 127, 0)) == "#ff7f00"  # Orange
    assert rgb_to_hex((128, 0, 128)) == "#800080"  # Purple
    assert rgb_to_hex((192, 192, 192)) == "#c0c0c0"  # Silver


# ============================================================================
# HEX TO BGR TESTS
# ============================================================================

def test_hex_to_bgr_pure_colors():
    """Test hex to BGR conversion with pure colors."""
    assert hex_to_bgr("#ff0000") == (0, 0, 255)  # Red
    assert hex_to_bgr("#00ff00") == (0, 255, 0)  # Green
    assert hex_to_bgr("#0000ff") == (255, 0, 0)  # Blue
    assert hex_to_bgr("#ffffff") == (255, 255, 255)  # White
    assert hex_to_bgr("#000000") == (0, 0, 0)  # Black


def test_hex_to_bgr_without_hash():
    """Test hex to BGR conversion without # symbol."""
    assert hex_to_bgr("ff0000") == (0, 0, 255)  # Red
    assert hex_to_bgr("00ff00") == (0, 255, 0)  # Green
    assert hex_to_bgr("0000ff") == (255, 0, 0)  # Blue


def test_hex_to_bgr_mixed_colors():
    """Test hex to BGR conversion with mixed colors."""
    assert hex_to_bgr("#ff7f00") == (0, 127, 255)  # Orange
    assert hex_to_bgr("#800080") == (128, 0, 128)  # Purple


# ============================================================================
# PRINT FUNCTION TESTS
# ============================================================================

def test_print_header(capsys):
    """Test print_header outputs correctly."""
    print_header("TEST HEADER")
    captured = capsys.readouterr()
    
    assert "TEST HEADER" in captured.out
    assert "=" * 60 in captured.out


def test_print_step(capsys):
    """Test print_step outputs correctly."""
    print_step(1, "Loading image")
    captured = capsys.readouterr()
    
    assert "Step 1" in captured.out
    assert "Loading image" in captured.out
    assert "---" in captured.out


def test_print_success(capsys):
    """Test print_success outputs correctly."""
    print_success("Operation completed")
    captured = capsys.readouterr()
    
    assert "✓" in captured.out
    assert "Operation completed" in captured.out