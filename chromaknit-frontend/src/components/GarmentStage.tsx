import { useRef, useState } from "react";
import type { GarmentSession } from "../hooks/useAppState";
import "./GarmentStage.css";

interface GarmentSample {
  src: string;
  label: string;
}

const GARMENT_SAMPLES: GarmentSample[] = [
  { src: "/samples/garment-cardigan.jpg", label: "cardigan" },
  { src: "/samples/garment-green-beanie.jpg", label: "beanie" },
  { src: "/samples/garment-red-socks.jpg", label: "socks" },
  { src: "/samples/garment-black-blanket.jpg", label: "blanket" },
  { src: "/samples/garment-baby.jpg", label: "baby knit" },
];

interface GarmentStageProps {
  session: GarmentSession | null;
  isRecoloring: boolean;
  currentRecolorUrl: string | null;
  error: string | null;
  onUpload: (file: File) => void;
  onClear: () => void;
}

/**
 * Garment area beneath the yarn palette.
 *
 * No session yet: shows an upload zone (drag-and-drop or click to pick).
 * Session in flight: shows the original alongside the in-progress recolour.
 * Session with a result: shows a before/after slider with a download link.
 *
 * Picking a yarn in the parent palette is what triggers recolour. This
 * component is purely a view onto state.garmentSession + state.currentRecolorUrl.
 */
function GarmentStage({
  session,
  isRecoloring,
  currentRecolorUrl,
  error,
  onUpload,
  onClear,
}: GarmentStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState(50);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    onUpload(file);
    e.target.value = "";
  };

  const handleSampleClick = async (sample: GarmentSample) => {
    try {
      const response = await fetch(sample.src);
      const blob = await response.blob();
      const file = new File([blob], `${sample.label}.jpg`, { type: "image/jpeg" });
      onUpload(file);
    } catch {
      // Sample fetch failed (network or 404). The upload tile is still
      // available; no surfaced error.
    }
  };

  if (!session) {
    return (
      <section className="garment-stage" aria-label="Garment workspace">
        <div className="garment-empty-card">
          <button
            type="button"
            className="garment-upload-tile"
            onClick={() => inputRef.current?.click()}
            aria-label="Upload a garment image"
          >
            <span className="garment-upload-plus" aria-hidden="true">+</span>
            <span className="garment-upload-title">upload a garment</span>
            <span className="garment-upload-hint">flat-lay or worn, jpg or png, up to 5MB</span>
          </button>
          <p className="garment-samples-label">or try a sample</p>
          <div
            className="garment-samples-grid"
            role="group"
            aria-label="Garment samples"
          >
            {GARMENT_SAMPLES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                className="garment-sample-card"
                onClick={() => handleSampleClick(sample)}
                aria-label={`Use ${sample.label} sample`}
              >
                <img src={sample.src} alt="" />
                <span className="garment-sample-label">{sample.label}</span>
              </button>
            ))}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          aria-label="Upload a garment image"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        {error && (
          <p className="garment-stage-error" role="alert">{error}</p>
        )}
      </section>
    );
  }

  // Session present. Show slider when we have a result, otherwise the
  // original with a recolouring overlay.
  const updatePosition = (clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  };

  return (
    <section className="garment-stage" aria-label="Garment workspace">
      <div className="garment-card">
        <div
          ref={containerRef}
          className="garment-compare"
          onMouseDown={() => { draggingRef.current = true; }}
          onMouseUp={() => { draggingRef.current = false; }}
          onMouseLeave={() => { draggingRef.current = false; }}
          onMouseMove={(e) => { if (draggingRef.current) updatePosition(e.clientX); }}
          onTouchMove={(e) => updatePosition(e.touches[0].clientX)}
        >
          <img
            src={session.previewUrl}
            alt="Original garment"
            className="garment-img garment-img-base"
          />
          {currentRecolorUrl && (
            <div
              className="garment-img-overlay"
              style={{ clipPath: `inset(0 0 0 ${position}%)` }}
            >
              <img
                src={currentRecolorUrl}
                alt="Recoloured garment"
                className="garment-img"
              />
            </div>
          )}
          {currentRecolorUrl && (
            <>
              <div
                className="garment-divider"
                style={{ left: `${position}%` }}
                aria-hidden="true"
              />
              <div
                className="garment-handle"
                style={{ left: `${position}%` }}
                aria-hidden="true"
              >
                {String.fromCharCode(0x25C0)}{String.fromCharCode(0x25B6)}
              </div>
            </>
          )}
          {isRecoloring && (
            <div className="garment-recoloring-overlay" role="status">
              <span className="garment-recoloring-spinner" aria-hidden="true" />
              <span>recolouring...</span>
            </div>
          )}
        </div>
        {currentRecolorUrl && (
          <input
            type="range"
            className="garment-range"
            min="0"
            max="100"
            value={position}
            aria-label="Drag to compare original and recoloured garment"
            onChange={(e) => setPosition(Number(e.target.value))}
          />
        )}
        <div className="garment-actions">
          {currentRecolorUrl && (
            <a
              href={currentRecolorUrl}
              download="chromaknit-recoloured.png"
              className="garment-action-link"
            >
              download
            </a>
          )}
          <button
            type="button"
            className="garment-action-link garment-action-link--secondary"
            onClick={onClear}
          >
            change garment
          </button>
        </div>
        {error && (
          <p className="garment-stage-error" role="alert">{error}</p>
        )}
      </div>
    </section>
  );
}

export default GarmentStage;
