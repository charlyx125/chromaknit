import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import time
import cv2
import numpy as np

from core.garment_recolor import GarmentRecolorer


def create_test_image(width, height, filename):
    """
    Create a test image with a single color (YELLOW).
    
    Args:
        width (int): Image width in pixels
        height (int): Image height in pixels
        filename (str): Where to save the image
    """
    img = np.full((height, width, 3), [0, 200, 200], dtype=np.uint8)  # Yellow in BGR
    cv2.imwrite(filename, img)
    return filename


def benchmark_recoloring(garment_path, target_colors):
    """
    Benchmark recoloring  
    
    Args:
        garment_path (str): Path to test image
        target_colors (list[string]): List of hex code
        
    Returns:
        float: Time taken in seconds
    """
    recolorer = GarmentRecolorer(garment_image_path=garment_path)
    start_time = time.time()
    recolorer.recolor_garment(target_colors)
    end_time = time.time()
    
    return end_time - start_time


def run_benchmarks():
    """
    Run benchmarks on different image sizes.
    """
    print("\n" + "="*60)
    print("CHROMAKNIT - GARMENT RECOLOR PERFORMANCE BENCHMARKS")
    print("="*60)
    
    # Define test cases: (name, width, height)
    test_cases = [
        ("Small",  300, 300),    # 90K pixels
        ("Medium", 800, 800),    # 640K pixels
        ("Large",  1920, 1080),  # 2M pixels
    ]
    
    results = []

    test_colors = ["#142a68", "#23438d", "#0c153b", "#3e64b2", "#658ad6"]

    
    # Run benchmarks
    for name, width, height in test_cases:
        print(f"\n--- Testing {name} Image ({width}x{height}) ---")
        
        # Create test image
        filename = f"benchmarks/test_garment_{name.lower()}.jpg"
        create_test_image(width, height, filename)
        
        # Run benchmark
        elapsed = benchmark_recoloring(filename, test_colors)
        
        results.append({
            'name': name,
            'size': f"{width}x{height}",
            'pixels': width * height,
            'time': elapsed
        })
        
        print(f"✓ Completed in {elapsed:.3f} seconds")
    
    # Print summary table
    print("\n" + "="*60)
    print("BENCHMARK RECOLOR GARMENTS RESULTS SUMMARY")
    print("="*60)
    print(f"\n{'Size':<10} {'Dimensions':<12} {'Pixels':<12} {'Time (s)':<10}")
    print("-" * 60)
    
    for result in results:
        print(f"{result['name']:<10} {result['size']:<12} {result['pixels']:>10,}  {result['time']:>8.3f}")
    
    print("\n" + "="*60)
    print("✓ Benchmarks complete!")
    print("="*60 + "\n")

    # Save results to file
    with open("benchmarks/recoloring_results.txt", "w") as f:
        f.write("CHROMAKNIT RECOLOR GARMENTS BENCHMARK RESULTS\n")
        f.write("="*60 + "\n\n")
        for result in results:
            f.write(f"{result['name']}: {result['time']:.3f}s\n")


if __name__ == "__main__":
    os.makedirs("benchmarks", exist_ok=True)
    
    run_benchmarks()
