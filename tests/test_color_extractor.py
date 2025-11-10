"""
Unit tests for ColorExtractor class.

Run with: pytest tests/test_color_extractor.py -v
"""

import pytest
import numpy as np
import cv2
import os
from core.yarn_color_extractor import ColorExtractor


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
    image_path = tmp_path / "test_yarn.jpg"
    cv2.imwrite(str(image_path), img)
    
    return str(image_path)


@pytest.fixture
def invalid_image_path():
    """
    Returns a path to a non-existent image.
    """
    return "path/to/nonexistent/image.jpg"


@pytest.fixture
def extractor(sample_image_path):
    """
    Create a ColorExtractor instance with a valid test image.
    """
    return ColorExtractor(image_path=sample_image_path, n_colors=3)


# ============================================================================
# INITIALIZATION TESTS
# ============================================================================

def test_init_with_defaults(sample_image_path):
    """Test ColorExtractor initialization with default parameters."""
    extractor = ColorExtractor(image_path=sample_image_path)
    
    assert extractor.image_path == sample_image_path
    assert extractor.n_colors == 5  # default value
    assert extractor.image is None
    assert extractor.image_rgb is None
    assert extractor.hex_codes is None
    assert extractor.counts is None


def test_init_with_custom_n_colors(sample_image_path):
    """Test ColorExtractor initialization with custom n_colors."""
    extractor = ColorExtractor(image_path=sample_image_path, n_colors=10)
    
    assert extractor.n_colors == 10


# ============================================================================
# IMAGE LOADING TESTS
# ============================================================================

def test_load_image_success(extractor):
    """Test successful image loading."""
    result = extractor.load_image()
    
    assert result is True
    assert extractor.image is not None
    assert isinstance(extractor.image, np.ndarray)
    assert len(extractor.image.shape) == 3  # height, width, channels


def test_load_image_failure(invalid_image_path):
    """Test image loading with invalid path."""
    extractor = ColorExtractor(image_path=invalid_image_path)
    result = extractor.load_image()
    
    assert result is False
    assert extractor.image is None


# ============================================================================
# COLOR CONVERSION TESTS
# ============================================================================

def test_convert_bgr_to_rgb_success(extractor):
    """Test BGR to RGB conversion."""
    extractor.load_image()
    result = extractor.convert_bgr_to_rgb()
    
    assert result is True
    assert extractor.image_rgb is not None
    assert isinstance(extractor.image_rgb, np.ndarray)
    assert extractor.image_rgb.shape == extractor.image.shape


def test_convert_bgr_to_rgb_without_loading():
    """Test BGR to RGB conversion without loading image first."""
    extractor = ColorExtractor(image_path="dummy.jpg")
    result = extractor.convert_bgr_to_rgb()
    
    assert result is False
    assert extractor.image_rgb is None


def test_bgr_to_rgb_color_channels_swapped(extractor):
    """Test that BGR to RGB actually swaps the color channels."""
    extractor.load_image()
    extractor.convert_bgr_to_rgb()
    
    # Check that red and blue channels are swapped
    # OpenCV loads as BGR, so image[:,:,0] is blue, image[:,:,2] is red
    # After conversion, image_rgb[:,:,0] should be red, image_rgb[:,:,2] should be blue
    assert not np.array_equal(extractor.image[:, :, 0], extractor.image_rgb[:, :, 0])
    assert not np.array_equal(extractor.image[:, :, 2], extractor.image_rgb[:, :, 2])


# ============================================================================
# RGB TO HEX TESTS
# ============================================================================

def test_rgb_to_hex_pure_colors(extractor):
    """Test RGB to hex conversion with pure colors."""
    assert extractor.rgb_to_hex((255, 0, 0)) == "#ff0000"  # Red
    assert extractor.rgb_to_hex((0, 255, 0)) == "#00ff00"  # Green
    assert extractor.rgb_to_hex((0, 0, 255)) == "#0000ff"  # Blue
    assert extractor.rgb_to_hex((255, 255, 255)) == "#ffffff"  # White
    assert extractor.rgb_to_hex((0, 0, 0)) == "#000000"  # Black


def test_rgb_to_hex_mixed_colors(extractor):
    """Test RGB to hex conversion with mixed colors."""
    assert extractor.rgb_to_hex((255, 127, 0)) == "#ff7f00"  # Orange
    assert extractor.rgb_to_hex((128, 0, 128)) == "#800080"  # Purple
    assert extractor.rgb_to_hex((192, 192, 192)) == "#c0c0c0"  # Silver


# ============================================================================
# PREPROCESSING TESTS
# ============================================================================

def test_preprocess_image_success(extractor):
    """Test successful image preprocessing."""
    result = extractor._preprocess_image()
    
    assert result is True
    assert extractor.image is not None
    assert extractor.image_rgb is not None


def test_preprocess_image_failure(invalid_image_path):
    """Test preprocessing with invalid image path."""
    extractor = ColorExtractor(image_path=invalid_image_path)
    result = extractor._preprocess_image()
    
    assert result is False


# ============================================================================
# RESHAPE TESTS
# ============================================================================

def test_reshape_for_clustering(extractor):
    """Test image reshaping for clustering."""
    extractor._preprocess_image()
    pixels = extractor._reshape_for_clustering()
    
    assert isinstance(pixels, np.ndarray)
    assert len(pixels.shape) == 2  # Should be 2D array
    assert pixels.shape[1] == 3  # RGB channels
    assert pixels.shape[0] == 100 * 100  # total pixels from 100x100 image


# ============================================================================
# CLUSTERING TESTS
# ============================================================================

def test_cluster_colors(extractor):
    """Test K-means clustering."""
    extractor._preprocess_image()
    pixels = extractor._reshape_for_clustering()
    kmeans = extractor._cluster_colors(pixels)
    
    assert kmeans is not None
    assert hasattr(kmeans, 'cluster_centers_')
    assert hasattr(kmeans, 'labels_')
    assert len(kmeans.cluster_centers_) == 3  # n_colors=3


def test_cluster_colors_correct_number(extractor):
    """Test that clustering produces correct number of clusters."""
    extractor._preprocess_image()
    pixels = extractor._reshape_for_clustering()
    kmeans = extractor._cluster_colors(pixels)
    
    assert kmeans.n_clusters == extractor.n_colors


# ============================================================================
# SORTING TESTS
# ============================================================================

def test_sort_by_frequency(extractor):
    """Test color sorting by frequency."""
    extractor._preprocess_image()
    pixels = extractor._reshape_for_clustering()
    kmeans = extractor._cluster_colors(pixels)
    extractor._sort_by_frequency(kmeans)
    
    assert extractor.hex_codes is not None
    assert extractor.counts is not None
    assert len(extractor.hex_codes) == 3
    assert len(extractor.counts) == 3


def test_sort_by_frequency_descending(extractor):
    """Test that colors are sorted in descending order by frequency."""
    extractor._preprocess_image()
    pixels = extractor._reshape_for_clustering()
    kmeans = extractor._cluster_colors(pixels)
    extractor._sort_by_frequency(kmeans)
    
    # Counts should be in descending order
    assert all(extractor.counts[i] >= extractor.counts[i+1] 
               for i in range(len(extractor.counts)-1))


# ============================================================================
# FULL EXTRACTION TESTS
# ============================================================================

def test_extract_dominant_colors_success(extractor):
    """Test full color extraction pipeline."""
    colors = extractor.extract_dominant_colors()
    
    assert colors is not None
    assert len(colors) == 3
    assert all(isinstance(color, str) for color in colors)
    assert all(color.startswith('#') for color in colors)
    assert all(len(color) == 7 for color in colors)  # #RRGGBB format


def test_extract_dominant_colors_failure(invalid_image_path):
    """Test extraction with invalid image."""
    extractor = ColorExtractor(image_path=invalid_image_path, n_colors=3)
    colors = extractor.extract_dominant_colors()
    
    assert colors is None


def test_extract_dominant_colors_returns_hex_codes(extractor):
    """Test that extracted colors are valid hex codes."""
    colors = extractor.extract_dominant_colors()
    
    for color in colors:
        # Check format
        assert color.startswith('#')
        assert len(color) == 7
        # Check that it's valid hex (no exception raised)
        int(color[1:], 16)


# ============================================================================
# VISUALIZATION TESTS
# ============================================================================

def test_visualize_colors_success(extractor, tmp_path):
    """Test visualization creation."""
    extractor.extract_dominant_colors()
    output_path = tmp_path / "test_output.png"
    
    result = extractor.visualize_colors(output_path=str(output_path))
    
    assert result is True
    assert os.path.exists(output_path)


def test_visualize_colors_without_extraction(extractor, tmp_path):
    """Test visualization without extracting colors first."""
    output_path = tmp_path / "test_output.png"
    result = extractor.visualize_colors(output_path=str(output_path))
    
    assert result is False
    assert not os.path.exists(output_path)


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

def test_full_pipeline(sample_image_path, tmp_path):
    """Test complete extraction and visualization pipeline."""
    # Create extractor
    extractor = ColorExtractor(image_path=sample_image_path, n_colors=3)
    
    # Extract colors
    colors = extractor.extract_dominant_colors()
    assert colors is not None
    assert len(colors) == 3
    
    # Visualize
    output_path = tmp_path / "full_pipeline.png"
    result = extractor.visualize_colors(output_path=str(output_path))
    assert result is True
    assert os.path.exists(output_path)


def test_different_n_colors_values(sample_image_path):
    """Test extraction with different n_colors values."""
    for n in [1, 3, 5, 10]:
        extractor = ColorExtractor(image_path=sample_image_path, n_colors=n)
        colors = extractor.extract_dominant_colors()
        
        assert colors is not None
        assert len(colors) == n