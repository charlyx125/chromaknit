import type { Mode } from "../hooks/useAppState";
import "./ModeToolbar.css";

interface ModeToolbarProps {
  activeMode: Mode;
  onChange: (mode: Mode) => void;
  // Hide the toolbar until a garment session exists. The mode is irrelevant
  // when there is nothing to apply colours to.
  visible: boolean;
}

interface ModeOption {
  mode: Mode;
  label: string;
  description: string;
  ready: boolean;
}

const MODES: ModeOption[] = [
  {
    mode: "auto",
    label: "Auto",
    description: "Recolour the whole garment in the active yarn.",
    ready: true,
  },
  {
    mode: "paint",
    label: "Paint",
    description: "Brush a region with the loaded yarn.",
    ready: true,
  },
  {
    mode: "select",
    label: "Select",
    description: "Tap a region of the garment to recolour.",
    ready: false,
  },
];

/**
 * Left rail in the garment stage. Three editorial tiles stacked vertically:
 * Auto (shipped), Paint (shipped, Phase 2.B), Select (phase 3, shown muted
 * with a gold "Soon" tag and disabled).
 */
function ModeToolbar({ activeMode, onChange, visible }: ModeToolbarProps) {
  if (!visible) return null;

  return (
    <aside className="mode-rail" aria-label="Recolour modes">
      <div className="mode-rail-head">
        <span className="caps">Mode</span>
      </div>
      {MODES.map((opt) => {
        const isActive = opt.ready && activeMode === opt.mode;
        const isComingSoon = !opt.ready;
        const classes = [
          "mode-tile",
          isActive ? "is-active" : "",
          isComingSoon ? "is-coming-soon" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={opt.mode}
            type="button"
            className={classes}
            onClick={() => opt.ready && onChange(opt.mode)}
            aria-pressed={isActive}
            aria-disabled={!opt.ready}
            disabled={!opt.ready}
            title={opt.description}
          >
            <span className="mode-tile-text">
              <span className="mode-tile-name">{opt.label}</span>
              <span className="mode-tile-desc">{opt.description}</span>
            </span>
            {isComingSoon && (
              <span className="mode-tile-soon" aria-hidden="true">Soon</span>
            )}
          </button>
        );
      })}
    </aside>
  );
}

export default ModeToolbar;
