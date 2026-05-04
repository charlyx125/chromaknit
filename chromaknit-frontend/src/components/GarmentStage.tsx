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
  // Returns a promise so the stage can show its own loading state on the
  // clicked sample tile / upload button while the parent's handler is in
  // flight (rembg can take a couple of seconds, so visible feedback matters).
  onUpload: (file: File) => Promise<void> | void;
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
  const [localError, setLocalError] = useState<string | null>(null);
  // Tracks which sample is currently uploading so we can show a per-tile
  // spinner. The whole sample grid disables while one is in flight to
  // prevent confused multi-click states.
  const [uploadingSampleLabel, setUploadingSampleLabel] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLocalError("That file is not an image. Pick a JPG or PNG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setLocalError(`That image is ${mb}MB. The upload limit is 5MB. Try resizing first.`);
      return;
    }
    setLocalError(null);
    setIsUploadingFile(true);
    try {
      await onUpload(file);
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleSampleClick = async (sample: GarmentSample) => {
    setUploadingSampleLabel(sample.label);
    try {
      const response = await fetch(sample.src);
      const blob = await response.blob();
      const file = new File([blob], `${sample.label}.jpg`, { type: "image/jpeg" });
      await onUpload(file);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Could not load that sample.";
      setLocalError(errorMessage);
    } finally {
      setUploadingSampleLabel(null);
    }
  };

  const anyUploadInFlight = isUploadingFile || uploadingSampleLabel !== null;

  if (!session) {
    return (
      <section className="garment-stage" aria-label="Garment workspace">
        <div className="garment-empty-card">
          <button
            type="button"
            className={`garment-upload-tile${isUploadingFile ? " garment-upload-tile--loading" : ""}`}
            onClick={() => inputRef.current?.click()}
            aria-label="Upload a garment image"
            disabled={anyUploadInFlight}
          >
            {isUploadingFile ? (
              <>
                <span className="garment-upload-spinner" aria-hidden="true" />
                <span className="garment-upload-title">uploading...</span>
              </>
            ) : (
              <>
                <span className="garment-upload-plus" aria-hidden="true">+</span>
                <span className="garment-upload-title">upload a garment</span>
                <span className="garment-upload-hint">flat-lay or worn, jpg or png, up to 5MB</span>
              </>
            )}
          </button>
          <p className="garment-samples-label">or try a sample</p>
          <div
            className="garment-samples-grid"
            role="group"
            aria-label="Garment samples"
          >
            {GARMENT_SAMPLES.map((sample) => {
              const isThisLoading = uploadingSampleLabel === sample.label;
              return (
                <button
                  key={sample.label}
                  type="button"
                  className={`garment-sample-card${isThisLoading ? " garment-sample-card--loading" : ""}`}
                  onClick={() => handleSampleClick(sample)}
                  aria-label={`Use ${sample.label} sample`}
                  disabled={anyUploadInFlight}
                >
                  <img src={sample.src} alt="" />
                  <span className="garment-sample-label">{sample.label}</span>
                  {isThisLoading && (
                    <span className="garment-sample-spinner" role="status" aria-label="Uploading" />
                  )}
                </button>
              );
            })}
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
        {(localError || error) && (
          <p className="garment-stage-error" role="alert">{localError || error}</p>
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
