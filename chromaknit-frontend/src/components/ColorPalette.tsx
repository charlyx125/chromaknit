interface ColorPaletteProps {
  colors: string[];
}

function ColorPalette({ colors }: ColorPaletteProps) {
  if (colors.length === 0) return null;

  return (
    <div className="palette-card">
      <h3>extracted palette</h3>
      <div className="swatches">
        {colors.map((color, i) => (
          <div
            key={i}
            className="swatch"
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <div className="dist-bar">
        {colors.map((color, i) => (
          <div
            key={i}
            style={{
              flex: colors.length - i,
              background: color,
            }}
          />
        ))}
      </div>
      <p className="palette-note">colour distribution across yarn sample</p>
    </div>
  );
}

export default ColorPalette;
