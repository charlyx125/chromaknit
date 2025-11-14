import cv2
import numpy as np



def load_image(image_path):
    """
    Load an image from disk.
    
    Args:
        image_path (str): Path to the image file
        
    Returns:
        numpy.ndarray: Image in BGR format, or None if loading failed
    """
    image = cv2.imread(image_path)  
    
    if image is None:
        print(f"❌ Error: Could not read image from {image_path}")
        return None
    
    return image

def convert_bgr_to_rgb(image):
    """
    Convert the loaded image from BGR (OpenCV default) to RGB.
    
    Returns:
        bool: True if successful, False if no image loaded
    """
    if image is None:
        print("❌ Error: No image loaded.")
        return None
    
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return image_rgb


def rgb_to_hex(rgb_tuple):
    """
    Convert RGB color to hex code.
    
    Args:
        rgb_tuple (tuple): RGB values (0-255 each)
        
    Returns:
        str: Hex color code (e.g., '#FF5733')
    """
    return '#%02x%02x%02x' % tuple(rgb_tuple)


def hex_to_bgr(hex_color):  
    """
    Convert a hex color string to a BGR tuple (OpenCV format).
    
    Args:
        hex_color (str): Hex color code (e.g., '#FF5733' or 'FF5733')
        
    Returns:
        tuple: BGR values (0-255 each)
    """
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (b, g, r)


def print_header(title):
    """
    Print a formatted header.
    
    Args:
        title (str): Header title to display
    """
    print("\n" + "="*60)
    print(title)
    print("="*60)


def print_step(step_number, description):
    """
    Print a formatted step message.
    
    Args:
        step_number (int): Step number
        description (str): Step description
    """
    print(f"\n--- Step {step_number}: {description} ---")


def print_success(message):
    """
    Print a success message with checkmark.
    
    Args:
        message (str): Success message
    """
    print(f"✓ {message}")