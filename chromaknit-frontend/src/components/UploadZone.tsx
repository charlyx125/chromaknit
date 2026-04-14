import { useState, useRef } from "react";
import "./UploadZone.css";

interface SampleImage {
  src: string;
  label: string;
}

interface UploadZoneProps {
  icon: string;
  heading: string;
  subtitle: string;
  onFileSelect: (file: File, previewUrl: string) => void;
  onClear?: () => void;
  onRecolor?: () => void;
  disabled?: boolean;
  samples?: SampleImage[];
  colors?: string[];
  isRecoloring?: boolean;
}

function UploadZone({ icon, heading, subtitle, onFileSelect, onClear, onRecolor, disabled, samples, colors = [], isRecoloring = false }: UploadZoneProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File must be less than 5MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("File must be an image");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setFileName(file.name);
      setPreviewUrl(url);
      onFileSelect(file, url);
    };
    reader.readAsDataURL(file);
  };

  const handleSampleClick = async (sample: SampleImage) => {
    setLoadingSample(true);
    try {
      const response = await fetch(sample.src);
      const blob = await response.blob();
      const file = new File([blob], `${sample.label}.jpg`, { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      setFileName(sample.label);
      setPreviewUrl(url);
      onFileSelect(file, url);
    } finally {
      setLoadingSample(false);
    }
  };

  const isDone = fileName !== null;

  const handleReupload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFileName(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
    onClear?.();
  };

  return (
    <div className={`upload-zone${isDone ? " done" : ""}`} role="region" aria-label="Image upload">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label="Choose an image file to upload"
        onChange={handleChange}
        disabled={disabled}
        style={{ display: "none" }}
      />
      {isDone && previewUrl ? (
        <div className="upload-done">
          {/* Image frame */}
          <div className="upload-frame">
            <img
              src={previewUrl}
              alt={fileName ?? "Uploaded image"}
              className="upload-hero-img"
            />
            <button
              className="upload-frame-change"
              onClick={handleReupload}
              aria-label="Change image"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Colour chips + action */}
          {colors.length > 0 && (
            <div className={`recolour-panel${isRecoloring ? " recolouring" : ""}`}>
              <span className="recolour-panel-label">
                {isRecoloring ? "recolouring..." : "recolour with these colours"}
              </span>
              <div className="recolour-chips">
                {colors.map((c, i) => {
                  const iconColor = colors[(i + 1) % colors.length];
                  const bounceClass = isRecoloring
                    ? i % 2 === 0 ? " bounce-down" : " bounce-up"
                    : "";
                  return (
                    <div key={i} className={`recolour-chip${bounceClass}`} style={isRecoloring ? { animationDelay: `${i * 0.1}s` } : undefined} role="img" aria-label={`Colour ${i + 1}: ${c}`} title={c}>
                      <div className="recolour-chip-swatch" style={{ background: c }}>
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: iconColor, opacity: 0.5 }}>
                          <path d="M12 2 L12 22 M2 12 L22 12 M5.5 5.5 L18.5 18.5 M18.5 5.5 L5.5 18.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                      <span className="recolour-chip-hex">{c.toLowerCase()}</span>
                    </div>
                  );
                })}
              </div>
              {onRecolor && !isRecoloring && (
                <button className="recolour-btn" onClick={onRecolor}>
                  recolour garment
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8 L11 8 M8 4 L12 8 L8 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div role="button" tabIndex={0} aria-label={heading} onClick={() => !disabled && !loadingSample && inputRef.current?.click()} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled && !loadingSample) { e.preventDefault(); inputRef.current?.click(); } }}>
          <span className="upload-icon" aria-hidden="true">{icon}</span>
          <h3>{heading}</h3>
          <p>{subtitle}</p>
          {samples && samples.length > 0 && !loadingSample && (
            <div className="sample-section" onClick={(e) => e.stopPropagation()}>
              <p className="sample-label">or try a sample</p>
              <div className="sample-grid">
                {samples.map((sample) => (
                  <button
                    key={sample.label}
                    className="sample-thumb"
                    onClick={() => handleSampleClick(sample)}
                  >
                    <img src={sample.src} alt={sample.label} />
                    <span>{sample.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {loadingSample && (
            <p className="sample-loading">loading sample...</p>
          )}
        </div>
      )}
    </div>
  );
}

export default UploadZone;
