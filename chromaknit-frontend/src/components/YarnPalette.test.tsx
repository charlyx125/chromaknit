import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import YarnPalette from "./YarnPalette";
import type { Yarn } from "../hooks/useAppState";

function makeYarn(overrides: Partial<Yarn> = {}): Yarn {
  return {
    id: "yarn-1",
    label: "plum",
    previewUrl: "/samples/plum.jpg",
    palette: ["#440022"],
    percentages: [1.0],
    status: "ready",
    ...overrides,
  };
}

describe("YarnPalette", () => {
  it("shows only the empty-state add tile when yarns is empty", () => {
    render(
      <YarnPalette
        yarns={[]}
        activeYarnId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /add your first yarn/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("renders one chip per yarn plus the trailing add tile", () => {
    const yarns = [
      makeYarn({ id: "y1", label: "plum" }),
      makeYarn({ id: "y2", label: "mint" }),
    ];
    render(
      <YarnPalette
        yarns={yarns}
        activeYarnId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /select plum/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select mint/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add another yarn/i })).toBeInTheDocument();
  });

  it("calls onSelect with the yarn id when its chip is clicked", () => {
    const onSelect = vi.fn();
    const yarns = [makeYarn({ id: "abc-123", label: "plum" })];
    render(
      <YarnPalette
        yarns={yarns}
        activeYarnId={null}
        onSelect={onSelect}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /select plum/i }));

    expect(onSelect).toHaveBeenCalledWith("abc-123");
  });

  it("calls onRemove with the yarn id when its × is clicked", () => {
    const onRemove = vi.fn();
    const yarns = [makeYarn({ id: "xyz-789", label: "mint" })];
    render(
      <YarnPalette
        yarns={yarns}
        activeYarnId={null}
        onSelect={vi.fn()}
        onRemove={onRemove}
        onAdd={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /remove mint/i }));

    expect(onRemove).toHaveBeenCalledWith("xyz-789");
  });

  it("renders a spinner inside the chip after the 1s grace window when yarn status is pending", () => {
    vi.useFakeTimers();
    try {
      const yarns = [
        makeYarn({ status: "pending", palette: [], percentages: [] }),
      ];
      render(
        <YarnPalette
          yarns={yarns}
          activeYarnId={null}
          onSelect={vi.fn()}
          onRemove={vi.fn()}
          onAdd={vi.fn()}
        />,
      );

      expect(
        screen.queryByRole("status", { name: /extracting colours/i }),
      ).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(
        screen.getByRole("status", { name: /extracting colours/i }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks the chip aria-pressed when its yarn id matches activeYarnId", () => {
    const yarns = [
      makeYarn({ id: "y1", label: "plum" }),
      makeYarn({ id: "y2", label: "mint" }),
    ];
    render(
      <YarnPalette
        yarns={yarns}
        activeYarnId="y2"
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /select plum/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /select mint/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("surfaces errorMessage in the title attribute when yarn status is error", () => {
    const yarns = [
      makeYarn({
        status: "error",
        palette: [],
        percentages: [],
        errorMessage: "extraction failed: file too small",
      }),
    ];
    render(
      <YarnPalette
        yarns={yarns}
        activeYarnId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const selectButton = screen.getByRole("button", { name: /select plum/i });
    expect(selectButton).toHaveAttribute(
      "title",
      "extraction failed: file too small",
    );
  });
});
