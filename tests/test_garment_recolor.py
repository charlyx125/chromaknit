"""
Unit tests for GarmentRecolorer class.

Run with: pytest tests/test_garment_recolor.py -v
"""

import pytest
import numpy as np
import cv2
import os
from core.garment_recolor import GarmentRecolorer


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def sample_image_path(tmp_path):
    """
    Create a temporary test image with known colors.
    Returns path to the image.
    """
    # Create a simple 100x100 image with 3 distinct color blocks
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    
    # Red block (top third)
    img[0:33, :] = [255, 0, 0]
    # Green block (middle third)
    img[33:66, :] = [0, 255, 0]
    # Blue block (bottom third)
    img[66:100, :] = [0, 0, 255]
    
    # Save to temporary file
    image_path = tmp_path / "test_garment.jpg"
    cv2.imwrite(str(image_path), img)
    
    return str(image_path)


@pytest.fixture
def invalid_image_path():
    """
    Returns a path to a non-existent image.
    """
    return "path/to/nonexistent/image.jpg"


@pytest.fixture
def recolorer(sample_image_path):
    """
    Create a GarmentRecolorer instance with a valid test image.
    """
    return GarmentRecolorer(garment_image_path=sample_image_path)

@pytest.fixture
def target_colors():
    """
    Sample target colors for recoloring tests.
    """
    return ['#FF0000', '#00FF00', '#0000FF']  # Red, Green, Blue


# ============================================================================
# INITIALIZATION TESTS
# ============================================================================

def test_init_with_valid_image_path(sample_image_path):
    """Test GarmentRecolorer initialization with valid image path"""
    recolorer = GarmentRecolorer(garment_image_path=sample_image_path)
    
    assert recolorer.garment_image_path == sample_image_path
    assert recolorer.image is None
    assert recolorer.mask is None
    assert recolorer.recolored_image is None
    assert recolorer.image_no_bg is None


def test_init_with_invalid_image_path(invalid_image_path):
    """Test GarmentRecolorer initialization with invalid image path"""
    recolorer = GarmentRecolorer(garment_image_path=invalid_image_path)
    
    assert recolorer.garment_image_path == invalid_image_path
    assert recolorer.image is None
    assert recolorer.mask is None
    assert recolorer.recolored_image is None
    assert recolorer.image_no_bg is None



# ============================================================================
# LOADING IMAGE TESTS
# ============================================================================


def test_load_image_success(recolorer):
    """Test successful image loading."""
    result = recolorer.load_image()
    
    assert result is True
    assert recolorer.image is not None
    assert isinstance(recolorer.image, np.ndarray)
    assert len(recolorer.image.shape) == 3  # height, width, channels


def test_load_image_failure(invalid_image_path):
    """Test image loading with invalid path."""
    recolorer = GarmentRecolorer(garment_image_path=invalid_image_path)
    result = recolorer.load_image()
    
    assert result is False
    assert recolorer.image is None

# ============================================================================
# BACKGROUND REMOVAL TESTS
# ============================================================================

def test_remove_background_without_loading(recolorer):
    """Test background removal without loading image first."""
    assert recolorer.image is None
    result = recolorer.remove_background()

    assert result is False
    assert recolorer.image_no_bg is None
    assert recolorer.mask is None
    

def test_remove_background_success(recolorer):
    """Test successful background removal."""
    recolorer.load_image()
   
    result = recolorer.remove_background()
    assert recolorer.image_no_bg is not None
    assert recolorer.mask is not None
    assert result is True
    
    # Check image_no_bg shape (should be RGBA: height x width x 4)
    assert len(recolorer.image_no_bg.shape) == 3
    assert recolorer.image_no_bg.shape[2] == 4  # RGBA has 4 channels
    
     # Check mask shape (should be 2D: height x width)
    assert len(recolorer.mask.shape) == 2
    assert recolorer.mask.shape == (100, 100)  # matches test image size
    # Check mask values are valid (0-255)
    assert recolorer.mask.min() >= 0
    assert recolorer.mask.max() <= 255


# ============================================================================
# APPLY COLORS TESTS
# ============================================================================

def test_apply_colors_without_image(recolorer, target_colors):
    """Test applying colors without loading image."""
    assert recolorer.image is None
    assert recolorer.mask is None
    result = recolorer.apply_colors(target_colors)

    assert result is False
    assert recolorer.recolored_image is None


def test_apply_colors_produces_images(recolorer, target_colors):
    """Test successful color application."""
    recolorer.load_image()
    recolorer.remove_background()
   
    result = recolorer.apply_colors(target_colors=target_colors)
    assert result is True
    assert recolorer.recolored_image is not None
    assert isinstance(recolorer.recolored_image, np.ndarray)
    assert len(recolorer.recolored_image.shape) == 3  # height, width, channels


def test_apply_colors_changes_pixel_values(recolorer, target_colors):
    """Test that apply_colors actually changes pixel values to target color."""
    # Load and prepare
    recolorer.load_image()
    recolorer.remove_background()
    
    # Get original pixel values where garment is
    original_pixels = recolorer.image[recolorer.mask > 0].copy()
    
    # Apply red color
    target_color = '#FF0000'  # Red
    recolorer.apply_colors([target_color])
    
    # Get recolored pixels where garment is
    recolored_pixels = recolorer.recolored_image[recolorer.mask > 0]
    
    # Check pixels changed
    assert not np.array_equal(original_pixels, recolored_pixels)
    
    # Check all garment pixels are now red (0, 0, 255) in BGR
    expected_bgr = (0, 0, 255)
    assert np.all(recolored_pixels == expected_bgr)


# ============================================================================
# SAVE RESULT TESTS
# ============================================================================

def test_save_result_without_recoloring(recolorer, tmp_path):
    """Test saving without recoloring first."""
    assert recolorer.recolored_image is None
    result = recolorer.save_result(str(tmp_path / "test.png")) 
    assert result is False

def test_save_result_success(recolorer, target_colors, tmp_path):
    """Test successful save."""
    recolorer.load_image()
    recolorer.remove_background()
    recolorer.apply_colors(target_colors=target_colors)

    output_path = tmp_path / "test_recoloring.png"

    result = recolorer.save_result(str(output_path))
    assert result is True
    assert os.path.exists(output_path)


# ============================================================================
# FULL PIPELINE TEST
# ============================================================================

def test_recolor_garment_full_pipeline(sample_image_path, target_colors):
    """Test complete recoloring pipeline."""  
    recolorer = GarmentRecolorer(garment_image_path=sample_image_path)
    result = recolorer.recolor_garment(target_colors)

    assert result is not None
    assert isinstance(result, np.ndarray)