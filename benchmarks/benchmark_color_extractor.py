"""
Performance Benchmarks for ColorExtractor

Run with: python benchmarks/benchmark_color_extractor.py
"""


import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


import time
import cv2
import numpy as np
from core.yarn_color_extractor import ColorExtractor


def create_test_image(width, height, filename):
    """
    Create a test image with random colors.
    
    Args:
        width (int): Image width in pixels
        height (int): Image height in pixels
        filename (str): Where to save the image
    """
    # Create random RGB image
    img = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    cv2.imwrite(filename, img)
    return filename


def benchmark_extraction(image_path, n_colors=5):
    """
    Benchmark color extraction on a single image.
    
    Args:
        image_path (str): Path to test image
        n_colors (int): Number of colors to extract
        
    Returns:
        float: Time taken in seconds
    """
    extractor = ColorExtractor(image_path=image_path, n_colors=n_colors)
    
    start_time = time.time()
    extractor.extract_dominant_colors()
    end_time = time.time()
    
    return end_time - start_time


def run_benchmarks():
    """
    Run benchmarks on different image sizes.
    """
    print("\n" + "="*60)
    print("CHROMAKNIT - COLOR EXTRACTOR PERFORMANCE BENCHMARKS")
    print("="*60)
    
    # Define test cases: (name, width, height)
    test_cases = [
        ("Small",  300, 300),    # 90K pixels
        ("Medium", 800, 800),    # 640K pixels
        ("Large",  1920, 1080),  # 2M pixels
    ]
    
    results = []
    
    # Run benchmarks
    for name, width, height in test_cases:
        print(f"\n--- Testing {name} Image ({width}x{height}) ---")
        
        # Create test image
        filename = f"benchmarks/test_{name.lower()}.jpg"
        create_test_image(width, height, filename)
        
        # Run benchmark
        elapsed = benchmark_extraction(filename, n_colors=5)
        
        results.append({
            'name': name,
            'size': f"{width}x{height}",
            'pixels': width * height,
            'time': elapsed
        })
        
        print(f"✓ Completed in {elapsed:.3f} seconds")
    
    # Print summary table
    print("\n" + "="*60)
    print("BENCHMARK RESULTS SUMMARY")
    print("="*60)
    print(f"\n{'Size':<10} {'Dimensions':<12} {'Pixels':<12} {'Time (s)':<10}")
    print("-" * 60)
    
    for result in results:
        print(f"{result['name']:<10} {result['size']:<12} {result['pixels']:>10,}  {result['time']:>8.3f}")
    
    print("\n" + "="*60)
    print("✓ Benchmarks complete!")
    print("="*60 + "\n")

    # Save results to file
    with open("benchmarks/results.txt", "w") as f:
        f.write("CHROMAKNIT BENCHMARK RESULTS\n")
        f.write("="*60 + "\n\n")
        for result in results:
            f.write(f"{result['name']}: {result['time']:.3f}s\n")


if __name__ == "__main__":
    # Create benchmarks directory if it doesn't exist
    os.makedirs("benchmarks", exist_ok=True)
    
    run_benchmarks()


    