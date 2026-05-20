import type { Yarn } from "../hooks/useAppState";
import "./YarnPalette.css";

interface YarnPaletteProps {
  yarns: Yarn[];
  activeYarnId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

// Sub-text mirrors the yarn's state. Sample yarns from /samples/ are
// precomputed; everything else is treated as a user upload.
function subTextFor(yarn: Yarn): string {
  if (yarn.status === "pending") return "Reading colours";
  if (yarn.status === "error") return "Could not read";
  return yarn.previewUrl.startsWith("/samples/")
    ? "From the collection"
    : "Uploaded";
}

// Title-case the slug-style yarn label for display ("coral pink" -> "Coral Pink").
// We could store a display name on the Yarn record instead, but that would
// touch the reducer; this stays local to the palette and reverses easily.
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function YarnPalette({ yarns, activeYarnId, onSelect, onRemove, onAdd }: YarnPaletteProps) {
  if (yarns.length === 0) {
    return (
      <section className="palette-rail" aria-label="Yarn palette">
        <div className="palette-rail-head">
          <span className="caps">Your palette</span>
        </div>
        <button
          type="button"
          className="yarn-card is-add yarn-add--empty"
          onClick={onAdd}
          aria-label="Add your first yarn"
        >
          <span className="yarn-add-mark" aria-hidden="true">+</span>
          <span className="yarn-add-label">Add your first yarn</span>
        </button>
      </section>
    );
  }

  return (
    <section className="palette-rail" aria-label="Yarn palette">
      <div className="palette-rail-head">
        <span className="caps">Your palette</span>
      </div>

      <div className="yarn-scroll-wrap">
        <div className="yarn-row">
          {yarns.map((yarn) => {
            const isActive = yarn.id === activeYarnId;
            const isPending = yarn.status === "pending";
            const isError = yarn.status === "error";
            const swatches = yarn.palette.slice(0, 5);
            const display = titleCase(yarn.label);

            const cardClasses = [
              "yarn-card",
              isActive ? "is-active" : "",
              isError ? "is-error" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={yarn.id} className={cardClasses}>
                <button
                  type="button"
                  className="yarn-card-select"
                  onClick={() => onSelect(yarn.id)}
                  aria-label={`Select ${yarn.label}`}
                  aria-pressed={isActive}
                  title={isError ? yarn.errorMessage : yarn.label}
                >
                  <div className="yarn-thumb">
                    <img src={yarn.previewUrl} alt="" />
                    {isPending && (
                      <span
                        className="yarn-thumb-spinner"
                        role="status"
                        aria-label="Extracting colours"
                      />
                    )}
                  </div>
                  <div className="yarn-label">{display}</div>
                  <div className="yarn-sub">{subTextFor(yarn)}</div>
                  {swatches.length > 0 && (
                    <div className="yarn-swatches" aria-hidden="true">
                      {swatches.map((c, i) => (
                        <span key={i} style={{ background: c }} />
                      ))}
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  className="yarn-card-remove"
                  onClick={() => onRemove(yarn.id)}
                  aria-label={`Remove ${yarn.label}`}
                >
                  <span aria-hidden="true">&#x2715;</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="yarn-card is-add"
        onClick={onAdd}
        aria-label="Add another yarn"
      >
        <span className="yarn-add-mark" aria-hidden="true">+</span>
        <span className="yarn-add-label">Add another yarn</span>
      </button>
    </section>
  );
}

export default YarnPalette;
