import { useState, useRef } from "react";

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
    <div className={`upload-zone${isDone ? " done" : ""}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        disabled={disabled}
        style={{ display: "none" }}
      />
      {isDone && previewUrl ? (
        <div className="upload-done">
          <img
            src={previewUrl}
            alt={fileName ?? "Uploaded image"}
            className="upload-hero-img"
          />
          <div className="upload-done-actions">
            {colors.length > 0 && (
              <div className="recolour-with">
                <span className="recolour-with-label">recolour with</span>
                {colors.map((c, i) => (
                  <span key={i} className="upload-swatch" style={{ background: c }} />
                ))}
              </div>
            )}
            {onRecolor && !isRecoloring && (
              <button className="btn-primary" onClick={onRecolor}>
                recolour garment
              </button>
            )}
            <button
              className="change-btn"
              onClick={(e) => { handleReupload(e); inputRef.current?.click(); }}
            >
              change image
            </button>
          </div>
        </div>
      ) : (
        <div onClick={() => !disabled && !loadingSample && inputRef.current?.click()}>
          <span className="upload-icon">{icon}</span>
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
