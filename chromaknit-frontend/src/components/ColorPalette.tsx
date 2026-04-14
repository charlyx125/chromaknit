import "./ColorPalette.css";

interface ColorPaletteProps {
  colors: string[];
}

function ColorPalette({ colors }: ColorPaletteProps) {
  if (colors.length === 0) return null;

  return (
    <div className="palette-card" role="region" aria-label="Extracted colour palette">
      <h3>extracted palette</h3>
      <div className="palette-chips" role="list" aria-label="Extracted colours">
        {colors.map((color, i) => {
          const iconColor = colors[(i + 1) % colors.length];
          return (
          <div key={i} className="colour-chip" role="listitem" aria-label={`Colour ${i + 1}: ${color}`}>
            <div className="chip-swatch" style={{ backgroundColor: color }}>
              <svg className="chip-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: iconColor }}>
                <path d="M12 2 L12 22 M2 12 L22 12 M5.5 5.5 L18.5 18.5 M18.5 5.5 L5.5 18.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="chip-label">
              <span className="chip-hex">{color.toLowerCase()}</span>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default ColorPalette;
