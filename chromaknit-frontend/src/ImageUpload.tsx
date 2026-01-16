import { useState } from "react";

interface ImageUploadProps {
  label: string;
  onImageSelect: (file: File, previewUrl: string) => void;
  showPreview?: boolean;
}

function ImageUpload({ label, onImageSelect, showPreview = true }: ImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDisabled, setIsDisabled] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setPreviewUrl(url);
      onImageSelect(file, url);
      setIsDisabled(true);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <p>{label}</p>

      <input type="file" accept="image/*" onChange={handleFileChange} disabled={isDisabled} />

      {showPreview && previewUrl && (
        <img
          src={previewUrl}
          alt="Preview"
          style={{ maxWidth: "400px", width: "100%", marginTop: "1rem", borderRadius: "8px" }}
        />
      )}
    </div>
  );
}

export default ImageUpload;
