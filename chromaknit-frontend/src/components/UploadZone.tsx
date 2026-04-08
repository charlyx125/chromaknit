import { useState, useRef } from "react";

interface UploadZoneProps {
  icon: string;
  heading: string;
  subtitle: string;
  onFileSelect: (file: File, previewUrl: string) => void;
  onClear?: () => void;
  disabled?: boolean;
}

function UploadZone({ icon, heading, subtitle, onFileSelect, onClear, disabled }: UploadZoneProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
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

  const isDone = fileName !== null;

  const handleReupload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFileName(null);
    setPreviewUrl(null);
    setShowPreview(false);
    if (inputRef.current) inputRef.current.value = "";
    onClear?.();
  };

  return (
    <div
      className={`upload-zone${isDone ? " done" : ""}`}
      onClick={() => !isDone && !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        disabled={disabled}
        style={{ display: "none" }}
      />
      <span className="upload-icon">{icon}</span>
      <h3>{isDone ? fileName : heading}</h3>
      <p>{isDone ? "image uploaded" : subtitle}</p>
      {isDone && (
        <>
          <div className="upload-confirm">
            &#x2714; uploaded!
          </div>
          <div className="upload-actions">
            <button
              className="preview-toggle"
              onClick={(e) => { e.stopPropagation(); setShowPreview(!showPreview); }}
            >
              {showPreview ? "hide image" : "view your image"} {showPreview ? "\u25B2" : "\u25BC"}
            </button>
            <button
              className="preview-toggle"
              onClick={(e) => { handleReupload(e); inputRef.current?.click(); }}
            >
              change image
            </button>
          </div>
          {showPreview && previewUrl && (
            <img
              src={previewUrl}
              alt={fileName ?? "Uploaded image"}
              className="upload-preview"
            />
          )}
        </>
      )}
    </div>
  );
}

export default UploadZone;
