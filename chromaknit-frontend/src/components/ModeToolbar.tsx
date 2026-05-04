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
    description: "Recolour the whole garment with the active yarn",
    ready: true,
  },
  {
    mode: "paint",
    label: "Paint",
    description: "Drag on the garment to paint a region with the active yarn",
    ready: true,
  },
  {
    mode: "select",
    label: "Select",
    description: "Click a region to fill it with the active yarn (Phase 3)",
    ready: false,
  },
];

/**
 * Minimal mockup toolbar for Phase 2. Three buttons stacked vertically; the
 * canvas sits to the right of this rail. Auto is wired and works as it did
 * in Phase 1. Paint and Select are visible so the affordance is discoverable
 * but disabled until their modes ship; clicking shows the description as a
 * tooltip.
 */
function ModeToolbar({ activeMode, onChange, visible }: ModeToolbarProps) {
  if (!visible) return null;

  return (
    <div className="mode-toolbar" role="group" aria-label="Recolour mode">
      {MODES.map((opt) => {
        const isActive = activeMode === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            className={[
              "mode-toolbar-btn",
              isActive ? "mode-toolbar-btn--active" : "",
              opt.ready ? "" : "mode-toolbar-btn--disabled",
            ].filter(Boolean).join(" ")}
            onClick={() => opt.ready && onChange(opt.mode)}
            aria-pressed={isActive}
            aria-disabled={!opt.ready}
            disabled={!opt.ready}
            title={opt.description}
          >
            {opt.label}
            {!opt.ready && <span className="mode-toolbar-pending" aria-hidden="true">soon</span>}
          </button>
        );
      })}
    </div>
  );
}

export default ModeToolbar;
