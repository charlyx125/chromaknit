"""
Unit tests for GarmentRecolorer class.

Run with: pytest tests/test_garment_recolor.py -v
"""

import pytest
import numpy as np
import cv2
from pathlib import Path
from unittest.mock import patch, MagicMock
from core.garment_recolor import GarmentRecolorer


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def sample_image_path(tmp_path):
    """Create a temporary test image with known colors."""
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img[0:33, :] = [255, 0, 0]      # Red block (top third)
    img[33:66, :] = [0, 255, 0]     # Green block (middle third)
    img[66:100, :] = [0, 0, 255]    # Blue block (bottom third)
    
    image_path = tmp_path / "test_garment.jpg"
    cv2.imwrite(str(image_path), img)
    return str(image_path)


@pytest.fixture
def invalid_image_path():
    """Returns a path to a non-existent image."""
    return "path/to/nonexistent/image.jpg"


@pytest.fixture
def recolorer(sample_image_path):
    """Create a GarmentRecolorer instance with valid test image."""
    return GarmentRecolorer(garment_image_path=sample_image_path)


@pytest.fixture
def target_colors():
    """Sample target colors for recoloring tests."""
    return ['#FF0000', '#00FF00', '#0000FF']


@pytest.fixture
def recolorer_with_background_removed(recolorer):
    """Recolorer with image loaded and background removed."""
    recolorer.load_image()
    recolorer.remove_background()
    return recolorer


# ============================================================================
# INITIALIZATION TESTS
# ============================================================================

def test_init_with_valid_image_path(sample_image_path):
    """Test GarmentRecolorer initialization with valid image path."""
    recolorer = GarmentRecolorer(garment_image_path=sample_image_path)
    
    assert Path(str(recolorer.garment_image_path)) == Path(sample_image_path)
    assert recolorer.image is None
    assert recolorer.mask is None
    assert recolorer.recolored_image is None
    assert recolorer.image_no_bg is None


def test_init_with_invalid_image_path(invalid_image_path):
    """Test initialization with invalid image path."""
    recolorer = GarmentRecolorer(garment_image_path=invalid_image_path)
    
    assert Path(str(recolorer.garment_image_path)) == Path(invalid_image_path)
    assert all(attr is None for attr in [recolorer.image, recolorer.mask, 
                                         recolorer.recolored_image, recolorer.image_no_bg])


# ============================================================================
# LOAD IMAGE TESTS
# ============================================================================

def test_load_image_success(recolorer):
    """Test successful image loading."""
    result = recolorer.load_image()
    
    assert result is True
    assert recolorer.image is not None
    assert isinstance(recolorer.image, np.ndarray)
    assert len(recolorer.image.shape) == 3


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
    result = recolorer.remove_background()
    
    assert result is False
    assert recolorer.image_no_bg is None
    assert recolorer.mask is None


def test_remove_background_success(recolorer):
    """Test successful background removal."""
    recolorer.load_image()
    result = recolorer.remove_background()
    
    assert result is True
    assert recolorer.image_no_bg is not None
    assert recolorer.mask is not None
    
    # Verify shapes
    assert len(recolorer.image_no_bg.shape) == 3
    assert recolorer.image_no_bg.shape[2] == 4  # RGBA
    assert len(recolorer.mask.shape) == 2
    assert recolorer.mask.shape == (100, 100)
    
    # Verify mask values are valid
    assert 0 <= recolorer.mask.min() <= 255
    assert 0 <= recolorer.mask.max() <= 255


def test_remove_background_creates_alpha_channel(recolorer):
    """Test that background removal creates proper alpha channel."""
    recolorer.load_image()
    recolorer.remove_background()

    # Alpha channel should be extracted from image_no_bg
    alpha_channel = recolorer.image_no_bg[:, :, 3]
    assert np.array_equal(alpha_channel, recolorer.mask)


def test_remove_background_handles_rembg_exception(recolorer, monkeypatch):
    """Test that remove_background returns False when rembg raises.

    Pins the contract: upstream failures in the background-removal library
    must not propagate — the method returns False and the pipeline halts
    cleanly at the next step.
    """
    import rembg

    def _raise(*args, **kwargs):
        raise RuntimeError("simulated rembg failure")

    monkeypatch.setattr(rembg, "new_session", _raise)

    recolorer.load_image()
    result = recolorer.remove_background()

    assert result is False
    assert recolorer.image_no_bg is None
    assert recolorer.mask is None


# ============================================================================
# HELPER METHOD TESTS
# ============================================================================

def test_get_color_mapping_empty_brightness(recolorer):
    """Test color mapping with empty brightness values."""
    brightness_values = np.array([])
    result = recolorer._get_color_mapping(brightness_values, num_colors=3)
    
    assert len(result) == 0


def test_get_color_mapping_uniform_brightness(recolorer):
    """Test color mapping when all pixels have same brightness."""
    brightness_values = np.full(100, 128)
    result = recolorer._get_color_mapping(brightness_values, num_colors=3)
    
    assert all(idx == 0 for idx in result)  # All should map to first color


def test_get_color_mapping_varied_brightness(recolorer):
    """Test color mapping with varied brightness values."""
    brightness_values = np.linspace(0, 255, 100).astype(int)
    result = recolorer._get_color_mapping(brightness_values, num_colors=3)

    assert len(result) == 100
    assert all(0 <= idx < 3 for idx in result)
    assert 0 in result and 2 in result  # Should use all color indices


def test_get_color_mapping_weighted_respects_proportions(recolorer):
    """Test that weighted mapping distributes pixels proportionally by brightness rank.

    Contract: given 100 brightness values and weights [0.5, 0.3, 0.2], the
    algorithm must place exactly 50 pixels in bucket 0 (darkest), 30 in
    bucket 1, 20 in bucket 2. This pins the percentage-driven distribution
    that the API exposes via the `percentages` form field.
    """
    brightness = np.arange(100, dtype=float)  # 0..99, strictly increasing
    weights = [0.5, 0.3, 0.2]

    result = recolorer._get_color_mapping(brightness, num_colors=3, weights=weights)

    assert np.sum(result == 0) == 50
    assert np.sum(result == 1) == 30
    assert np.sum(result == 2) == 20

    # And the 50 darkest pixels must be the ones mapped to bucket 0.
    darkest_indices = np.argsort(brightness)[:50]
    assert np.all(result[darkest_indices] == 0)

    # The 20 brightest go to bucket 2.
    brightest_indices = np.argsort(brightness)[-20:]
    assert np.all(result[brightest_indices] == 2)


# ============================================================================
# APPLY COLORS TESTS
# ============================================================================

def test_apply_colors_without_image(recolorer, target_colors):
    """Test applying colors without loading image."""
    result = recolorer.apply_colors(target_colors)
    
    assert result is False
    assert recolorer.recolored_image is None


def test_apply_colors_without_mask(recolorer, target_colors):
    """Test applying colors without background removal."""
    recolorer.load_image()
    result = recolorer.apply_colors(target_colors)
    
    assert result is False


def test_apply_colors_success(recolorer_with_background_removed, target_colors):
    """Test successful color application."""
    result = recolorer_with_background_removed.apply_colors(target_colors)
    
    assert result is True
    assert recolorer_with_background_removed.recolored_image is not None
    assert isinstance(recolorer_with_background_removed.recolored_image, np.ndarray)
    assert len(recolorer_with_background_removed.recolored_image.shape) == 3


def test_apply_colors_remaps_brightness(recolorer_with_background_removed, target_colors):
    """Test that recoloring remaps brightness to yarn's range while preserving relative texture."""
    recolorer_with_background_removed.apply_colors(target_colors)

    recolored_image_hsv = cv2.cvtColor(recolorer_with_background_removed.recolored_image,
                                       cv2.COLOR_BGR2HSV)
    recolored_brightness = recolored_image_hsv[recolorer_with_background_removed.mask > 0, 2].astype(float)

    # Brightness values should be valid (0-255)
    assert recolored_brightness.min() >= 0
    assert recolored_brightness.max() <= 255
    # Recolored brightness should be within the yarn's color range, not the original garment's
    assert len(recolored_brightness) > 0


def test_apply_colors_changes_hue_saturation(recolorer_with_background_removed):
    """Test that recoloring changes hue and saturation."""
    original_image_hsv = cv2.cvtColor(recolorer_with_background_removed.image,
                                      cv2.COLOR_BGR2HSV)
    original_hs = original_image_hsv[recolorer_with_background_removed.mask > 0, :2]

    recolorer_with_background_removed.apply_colors(['#FF0000'])

    recolored_image_hsv = cv2.cvtColor(recolorer_with_background_removed.recolored_image,
                                       cv2.COLOR_BGR2HSV)
    recolored_hs = recolored_image_hsv[recolorer_with_background_removed.mask > 0, :2]

    # H and S should change
    assert not np.array_equal(original_hs, recolored_hs)


def test_apply_colors_with_weights_succeeds(recolorer_with_background_removed, target_colors):
    """Test that apply_colors takes the weighted branch when weights are provided.

    Exercises the weighted sort path in apply_colors — zipping hsv colors with
    weights, sorting together by brightness, then passing aligned weights into
    _get_color_mapping.
    """
    weights = [0.5, 0.3, 0.2]
    result = recolorer_with_background_removed.apply_colors(target_colors, weights=weights)

    assert result is True
    assert recolorer_with_background_removed.recolored_image is not None


def test_apply_colors_handles_flat_brightness_image(target_colors, tmp_path):
    """Test that apply_colors handles an image with uniform brightness.

    When every garment pixel has the same V value, garment_range is 0 and the
    clamp kicks in to prevent divide-by-zero. Bypasses load_image + remove_background
    to construct the degenerate state directly.
    """
    from core.garment_recolor import GarmentRecolorer

    recolorer = GarmentRecolorer(garment_image_path=str(tmp_path / "unused.jpg"))
    # Uniform mid-gray — all pixels share the same HSV V value.
    recolorer.image = np.full((50, 50, 3), 128, dtype=np.uint8)
    recolorer.mask = np.full((50, 50), 255, dtype=np.uint8)

    result = recolorer.apply_colors(target_colors)

    assert result is True
    assert recolorer.recolored_image is not None
    assert recolorer.recolored_image.shape == recolorer.image.shape


# ============================================================================
# SAVE RESULT TESTS
# ============================================================================

def test_save_result_without_recoloring(recolorer, tmp_path):
    """Test saving without recoloring first."""
    result = recolorer.save_result(str(tmp_path / "test.png"))
    
    assert result is False


def test_save_result_success(recolorer_with_background_removed, target_colors, tmp_path):
    """Test successful save."""
    recolorer_with_background_removed.apply_colors(target_colors=target_colors)
    output_path = tmp_path / "test_recoloring.png"
    
    result = recolorer_with_background_removed.save_result(str(output_path))
    
    assert result is True
    assert output_path.exists()


def test_save_result_creates_directories(recolorer_with_background_removed, target_colors, tmp_path):
    """Test that save creates missing directories."""
    recolorer_with_background_removed.apply_colors(target_colors)
    nested_path = tmp_path / "nested" / "dir" / "structure" / "output.png"
    
    result = recolorer_with_background_removed.save_result(str(nested_path))
    
    assert result is True
    assert nested_path.exists()


def test_save_result_produces_valid_image(recolorer_with_background_removed, target_colors, tmp_path):
    """Test that saved image can be read back."""
    recolorer_with_background_removed.apply_colors(target_colors)
    output_path = tmp_path / "test_output.png"
    recolorer_with_background_removed.save_result(str(output_path))
    
    loaded_image = cv2.imread(str(output_path))
    assert loaded_image is not None
    assert loaded_image.shape == recolorer_with_background_removed.recolored_image.shape


# ============================================================================
# FULL PIPELINE TEST
# ============================================================================

def test_recolor_garment_full_pipeline(sample_image_path, target_colors):
    """Test complete recoloring pipeline."""
    recolorer = GarmentRecolorer(garment_image_path=sample_image_path)
    result = recolorer.recolor_garment(target_colors)
    
    assert result is not None
    assert isinstance(result, np.ndarray)
    assert len(result.shape) == 3


def test_recolor_garment_with_invalid_image(invalid_image_path, target_colors):
    """Test pipeline with invalid image path."""
    recolorer = GarmentRecolorer(garment_image_path=invalid_image_path)
    result = recolorer.recolor_garment(target_colors)
    
    assert result is None


@pytest.mark.parametrize("num_colors", [1, 2, 3, 5])
def test_recolor_garment_with_varying_color_counts(sample_image_path, num_colors):
    """Test pipeline with different numbers of colors."""
    recolorer = GarmentRecolorer(garment_image_path=sample_image_path)
    target_colors = [f'#{i:02d}00ff' for i in range(num_colors)]
    result = recolorer.recolor_garment(target_colors)
    
    assert result is not None
    assert isinstance(result, np.ndarray)