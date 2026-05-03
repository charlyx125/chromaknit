import type { Yarn } from "../hooks/useAppState";
import "./YarnPalette.css";

interface YarnPaletteProps {
  yarns: Yarn[];
  activeYarnId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

function YarnPalette({ yarns, activeYarnId, onSelect, onRemove, onAdd }: YarnPaletteProps) {
  if (yarns.length === 0) {
    return (
      <div className="yarn-palette" role="region" aria-label="Yarn palette">
        <button
          type="button"
          className="yarn-add yarn-add--empty"
          onClick={onAdd}
          aria-label="Add your first yarn"
        >
          <span className="yarn-add-plus" aria-hidden="true">+</span>
          <span className="yarn-add-label">add your first yarn</span>
        </button>
      </div>
    );
  }

  return (
    <div className="yarn-palette" role="region" aria-label="Yarn palette">
      <ul className="yarn-list" role="list">
        {yarns.map((yarn) => {
          const isActive = yarn.id === activeYarnId;
          const isPending = yarn.status === "pending";
          const isError = yarn.status === "error";
          const dominantColor = yarn.palette[0];

          const chipClasses = [
            "yarn-chip",
            isActive ? "yarn-chip--active" : "",
            isError ? "yarn-chip--error" : "",
          ].filter(Boolean).join(" ");

          return (
            <li key={yarn.id} className="yarn-item">
              <div className={chipClasses}>
                <button
                  type="button"
                  className="yarn-chip-select"
                  onClick={() => onSelect(yarn.id)}
                  aria-label={`Select ${yarn.label}`}
                  aria-pressed={isActive}
                  title={isError ? yarn.errorMessage : yarn.label}
                >
                  <img
                    src={yarn.previewUrl}
                    alt=""
                    className="yarn-chip-thumb"
                  />
                  {isPending && (
                    <span
                      className="yarn-chip-spinner"
                      role="status"
                      aria-label="Extracting colours"
                    />
                  )}
                  {dominantColor && !isPending && !isError && (
                    <span
                      className="yarn-chip-dot"
                      style={{ background: dominantColor }}
                      aria-hidden="true"
                    />
                  )}
                </button>
                <button
                  type="button"
                  className="yarn-chip-remove"
                  onClick={() => onRemove(yarn.id)}
                  aria-label={`Remove ${yarn.label}`}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <span className="yarn-chip-label">{yarn.label}</span>
            </li>
          );
        })}
        <li className="yarn-item">
          <button
            type="button"
            className="yarn-add"
            onClick={onAdd}
            aria-label="Add a yarn"
          >
            <span className="yarn-add-plus" aria-hidden="true">+</span>
          </button>
        </li>
      </ul>
    </div>
  );
}

export default YarnPalette;
