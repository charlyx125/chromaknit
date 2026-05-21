import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders without crashing", () => {
    render(<App />);
  });

  it("reveals the yarn palette and picker after clicking try it now", () => {
    render(<App />);

    // Picker is hidden before any interaction.
    expect(screen.queryByRole("dialog", { name: /choose a yarn/i })).not.toBeInTheDocument();

    // Both the Masthead and the Hero render a "Try it now" button; either
    // triggers the same handleStart. Click the first one (Masthead).
    fireEvent.click(screen.getAllByRole("button", { name: /try it now/i })[0]);

    // Palette is now mounted and the picker opens automatically on first run.
    expect(screen.getByRole("region", { name: /yarn palette/i })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /choose a yarn/i })).toBeInTheDocument();
    // Sample tiles are rendered inside the picker.
    expect(screen.getByRole("button", { name: /add plum, deep yarn/i })).toBeInTheDocument();
  });

  it("hydrates the palette with persisted yarns on mount", () => {
    localStorage.setItem(
      "chromaknit:state",
      JSON.stringify({
        version: 1,
        yarns: [
          {
            id: "persisted-1",
            label: "saved plum",
            previewUrl: "/samples/dark-red-purple-yarn.jpg",
            palette: ["#440022"],
            percentages: [1.0],
            status: "ready",
          },
        ],
      }),
    );

    render(<App />);
    // Both the Masthead and the Hero render a "Try it now" button; either
    // triggers the same handleStart. Click the first one (Masthead).
    fireEvent.click(screen.getAllByRole("button", { name: /try it now/i })[0]);

    expect(
      screen.getByRole("button", { name: /select saved plum/i }),
    ).toBeInTheDocument();
  });
});
