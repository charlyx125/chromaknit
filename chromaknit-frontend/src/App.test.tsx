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
    expect(screen.queryByText(/pick a yarn to add/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try it now/i }));

    // Palette is now mounted and the picker opens automatically on first run.
    expect(screen.getByRole("region", { name: /yarn palette/i })).toBeInTheDocument();
    expect(screen.getByText(/pick a yarn to add/i)).toBeInTheDocument();
    // Sample tiles are rendered inside the picker.
    expect(screen.getByRole("button", { name: /add plum yarn/i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /try it now/i }));

    expect(
      screen.getByRole("button", { name: /select saved plum/i }),
    ).toBeInTheDocument();
  });
});
