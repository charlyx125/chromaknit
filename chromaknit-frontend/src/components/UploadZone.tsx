import { useState, useRef } from "react";

interface UploadZoneProps {
  icon: string;
  heading: string;
  subtitle: string;
  onFileSelect: (file: File, previewUrl: string) => void;
  disabled?: boolean;
}

function UploadZone({ icon, heading, subtitle, onFileSelect, disabled }: UploadZoneProps) {
  const [fileName, setFileName] = useState<string | null>(null);
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
      onFileSelect(file, url);
    };
    reader.readAsDataURL(file);
  };

  const isDone = fileName !== null;

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
        disabled={isDone || disabled}
        style={{ display: "none" }}
      />
      <span className="upload-icon">{icon}</span>
      <h3>{isDone ? fileName : heading}</h3>
      <p>{isDone ? "image uploaded" : subtitle}</p>
      {isDone && (
        <div className="upload-confirm">
          &#x2714; uploaded!
        </div>
      )}
    </div>
  );
}

export default UploadZone;
