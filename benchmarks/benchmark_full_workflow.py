"""
Performance Benchmarks for Full ChromaKnit Workflow

Tests the complete end-to-end workflow:
1. Color extraction from yarn image
2. Background removal from garment image
3. Garment recoloring with extracted colors

Run with: python benchmarks/benchmark_full_workflow.py
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import time
import cv2
import numpy as np
import psutil
from dataclasses import dataclass
from typing import Any, Callable

from core.yarn_color_extractor import ColorExtractor
from core.garment_recolor import GarmentRecolorer


@dataclass
class StageResult:
    """Result from a single benchmark stage."""
    name: str
    time_seconds: float
    memory_mb: float


@dataclass
class WorkflowResult:
    """Result from a complete workflow benchmark."""
    size_name: str
    dimensions: str
    pixels: int
    stages: list[StageResult]
    total_time: float
    peak_memory_mb: float

    @property
    def bottleneck(self) -> str:
        """Return the name of the slowest stage."""
        return max(self.stages, key=lambda s: s.time_seconds).name


def get_memory_mb() -> float:
    """Get current memory usage in MB."""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)


def create_yarn_image(width: int, height: int, filename: str) -> str:
    """Create a test yarn image with varied colors."""
    img = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    cv2.imwrite(filename, img)
    return filename


def create_garment_image(width: int, height: int, filename: str) -> str:
    """Create a test garment image with gradient for recoloring."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    for y in range(height):
        brightness = int((y / height) * 255)
        img[y, :] = [brightness, brightness, brightness]
    cv2.imwrite(filename, img)
    return filename


def measure_stage(name: str, action: Callable) -> tuple[Any, StageResult]:
    """Measure time and memory for a single stage."""
    mem_before = get_memory_mb()
    start_time = time.time()

    result = action()

    elapsed = time.time() - start_time
    mem_after = get_memory_mb()

    return result, StageResult(
        name=name,
        time_seconds=elapsed,
        memory_mb=max(0, mem_after - mem_before)
    )


def run_workflow(yarn_path: str, garment_path: str, n_colors: int = 5) -> tuple[list[StageResult], float, float]:
    """Run the complete workflow and measure each stage."""
    stages = []
    peak_memory = get_memory_mb()

    # Stage 1: Color extraction
    extractor = ColorExtractor(image_path=yarn_path, n_colors=n_colors)
    colors, stage = measure_stage("Color Extraction", extractor.extract_dominant_colors)
    stages.append(stage)
    peak_memory = max(peak_memory, get_memory_mb())

    # Stage 2: Background removal
    recolorer = GarmentRecolorer(garment_image_path=garment_path)
    recolorer.load_image()
    _, stage = measure_stage("Background Removal", recolorer.remove_background)
    stages.append(stage)
    peak_memory = max(peak_memory, get_memory_mb())

    # Stage 3: Garment recoloring
    _, stage = measure_stage("Garment Recoloring", lambda: recolorer.apply_colors(colors))
    stages.append(stage)
    peak_memory = max(peak_memory, get_memory_mb())

    total_time = sum(s.time_seconds for s in stages)

    return stages, total_time, peak_memory


def run_benchmarks() -> list[WorkflowResult]:
    """Run benchmarks on different image sizes."""
    print("\n" + "=" * 70)
    print("CHROMAKNIT - FULL WORKFLOW PERFORMANCE BENCHMARKS")
    print("=" * 70)

    test_cases = [
        ("Small",  300, 300),
        ("Medium", 800, 800),
        ("Large",  1920, 1080),
    ]

    results = []

    for name, width, height in test_cases:
        print(f"\n{'=' * 70}")
        print(f"Testing {name} Image ({width}x{height})")
        print("=" * 70)

        # Create test images
        yarn_path = f"benchmarks/test_yarn_{name.lower()}.jpg"
        garment_path = f"benchmarks/test_garment_{name.lower()}.jpg"

        create_yarn_image(width, height, yarn_path)
        create_garment_image(width, height, garment_path)

        # Run workflow
        stages, total_time, peak_memory = run_workflow(yarn_path, garment_path)

        result = WorkflowResult(
            size_name=name,
            dimensions=f"{width}x{height}",
            pixels=width * height,
            stages=stages,
            total_time=total_time,
            peak_memory_mb=peak_memory
        )
        results.append(result)

        print(f"\nCompleted in {total_time:.3f}s (Peak memory: {peak_memory:.1f} MB)")

    return results


def print_results_table(results: list[WorkflowResult]):
    """Print formatted results table to console."""
    print("\n" + "=" * 90)
    print("BENCHMARK RESULTS SUMMARY")
    print("=" * 90)

    # Header
    print(f"\n{'Size':<8} {'Dims':<12} {'Extraction':<12} {'Bg Removal':<12} "
          f"{'Recolor':<12} {'Total':<10} {'Memory':<10} {'Bottleneck'}")
    print("-" * 90)

    for r in results:
        extraction = next(s for s in r.stages if s.name == "Color Extraction")
        bg_removal = next(s for s in r.stages if s.name == "Background Removal")
        recolor = next(s for s in r.stages if s.name == "Garment Recoloring")

        print(f"{r.size_name:<8} {r.dimensions:<12} "
              f"{extraction.time_seconds:>10.3f}s "
              f"{bg_removal.time_seconds:>10.3f}s "
              f"{recolor.time_seconds:>10.3f}s "
              f"{r.total_time:>8.3f}s "
              f"{r.peak_memory_mb:>8.1f}MB "
              f"{r.bottleneck}")

    print("-" * 90)

    # Bottleneck analysis
    print("\nBOTTLENECK ANALYSIS")
    print("-" * 40)

    for r in results:
        print(f"{r.size_name}: {r.bottleneck} ({max(s.time_seconds for s in r.stages):.3f}s)")

    print("\n" + "=" * 90)
    print("Benchmarks complete!")
    print("=" * 90 + "\n")


def save_results_markdown(results: list[WorkflowResult]):
    """Save results to markdown file."""
    with open("benchmarks/workflow_results.md", "w", encoding="utf-8") as f:
        f.write("# ChromaKnit Full Workflow Benchmark Results\n\n")
        f.write("## Test Configuration\n\n")
        f.write("- **Workflow stages**: Color Extraction → Background Removal → Garment Recoloring\n")
        f.write("- **Number of colors extracted**: 5\n\n")

        f.write("## Results Summary\n\n")
        f.write("| Size | Dimensions | Pixels | Extraction | Bg Removal | Recolor | Total | Peak Memory |\n")
        f.write("|------|------------|--------|------------|------------|---------|-------|-------------|\n")

        for r in results:
            extraction = next(s for s in r.stages if s.name == "Color Extraction")
            bg_removal = next(s for s in r.stages if s.name == "Background Removal")
            recolor = next(s for s in r.stages if s.name == "Garment Recoloring")

            f.write(f"| {r.size_name} | {r.dimensions} | {r.pixels:,} | "
                    f"{extraction.time_seconds:.3f}s | {bg_removal.time_seconds:.3f}s | "
                    f"{recolor.time_seconds:.3f}s | {r.total_time:.3f}s | {r.peak_memory_mb:.1f} MB |\n")

        f.write("\n## Bottleneck Analysis\n\n")
        f.write("| Size | Bottleneck Stage | Time |\n")
        f.write("|------|------------------|------|\n")

        for r in results:
            slowest = max(r.stages, key=lambda s: s.time_seconds)
            f.write(f"| {r.size_name} | {r.bottleneck} | {slowest.time_seconds:.3f}s |\n")

        f.write("\n## Stage Breakdown\n\n")

        for r in results:
            f.write(f"### {r.size_name} ({r.dimensions})\n\n")
            total = r.total_time

            for stage in r.stages:
                pct = (stage.time_seconds / total) * 100 if total > 0 else 0
                bar_len = int(pct / 2)
                bar = "█" * bar_len + "░" * (50 - bar_len)
                f.write(f"- **{stage.name}**: {stage.time_seconds:.3f}s ({pct:.1f}%)\n")
                f.write(f"  ```\n  {bar}\n  ```\n")

            f.write("\n")

        f.write("---\n*Generated by benchmark_full_workflow.py*\n")

    print("Results saved to benchmarks/workflow_results.md")


if __name__ == "__main__":
    os.makedirs("benchmarks", exist_ok=True)

    results = run_benchmarks()
    print_results_table(results)
    save_results_markdown(results)
