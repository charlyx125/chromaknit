import { useRef } from "react";
import "./YarnPicker.css";

interface Sample {
  src: string;
  label: string;
}

const YARN_SAMPLES: Sample[] = [
  { src: "/samples/dark-red-purple-yarn.jpg", label: "plum" },
  { src: "/samples/yarn-pink-unknit.jpg", label: "pink" },
  { src: "/samples/coral-pink-yarn.jpg", label: "coral pink" },
  { src: "/samples/yarn-red.png", label: "coral red" },
  { src: "/samples/yarn-green.jpg", label: "lime" },
  { src: "/samples/yarn-light-green.jpg", label: "pastel green" },
  { src: "/samples/yarn-mint.jpg", label: "mint" },
  { src: "/samples/yarn-dark-green.jpg", label: "forest green" },
  { src: "/samples/yarn-dark-blue.jpg", label: "dark blue" },
  { src: "/samples/yarn-light-blue.jpg", label: "baby blue" },
  { src: "/samples/yarn-mix-purple.jpg", label: "soft purple" },
  { src: "/samples/grey-yarn.jpg", label: "grey" },
  { src: "/samples/cream-yarn.png", label: "cream" },
];

interface YarnPickerProps {
  // Upload path: hands a user-supplied File to the parent for /api/colors/extract.
  onYarnUpload: (file: File, label: string) => void;
  // Sample path: hands the label + static image src to the parent so it can
  // load the precomputed palette JSON instead of round-tripping the image
  // through the backend extractor.
  onYarnSampleSelect: (label: string, src: string) => void;
  onClose?: () => void;
}

function YarnPicker({ onYarnUpload, onYarnSampleSelect, onClose }: YarnPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSampleClick = (sample: Sample) => {
    onYarnSampleSelect(sample.label, sample.src);
    onClose?.();
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const label = file.name.replace(/\.[^.]+$/, "");
    onYarnUpload(file, label);
    onClose?.();
    e.target.value = "";
  };

  return (
    <div className="yarn-picker">
      <p className="yarn-picker-title">pick a yarn to add</p>
      <p className="yarn-picker-subtitle">choose a swatch or upload your own</p>
      <div
        className="yarn-picker-grid"
        role="group"
        aria-label="Yarn samples"
      >
        <button
          type="button"
          className="yarn-picker-card yarn-picker-upload"
          onClick={handleUploadClick}
          aria-label="Upload your own yarn image"
        >
          <span className="yarn-picker-upload-plus" aria-hidden="true">+</span>
          <span className="yarn-picker-upload-text">upload yours</span>
        </button>
        {YARN_SAMPLES.map((sample) => (
          <button
            key={sample.label}
            type="button"
            className="yarn-picker-card"
            onClick={() => handleSampleClick(sample)}
            aria-label={`Add ${sample.label} yarn`}
          >
            <img src={sample.src} alt="" />
            <span className="yarn-picker-card-label">{sample.label}</span>
          </button>
        ))}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label="Upload your own yarn image"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
    </div>
  );
}

export default YarnPicker;
