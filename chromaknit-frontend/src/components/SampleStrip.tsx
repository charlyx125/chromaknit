import { useState } from "react";
import ColorPalette from "./ColorPalette";
import UploadZone from "./UploadZone";
import BeforeAfter from "./BeforeAfter";

interface Sample {
  src: string;
  label: string;
}

const YARN_SAMPLES: Sample[] = [
  { src: "/samples/yarn-blue.jpg", label: "blue" },
  { src: "/samples/yarn-pink.jpg", label: "pink" },
  { src: "/samples/yarn-purple.jpg", label: "purple" },
  { src: "/samples/yarn-light-blue.jpg", label: "light blue" },
  { src: "/samples/yarn-light-green.jpg", label: "sage" },
];

interface SampleStripProps {
  onSelectSample: (file: File, previewUrl: string) => void;
  onSkipToUpload: () => void;
  isExtracting: boolean;
  extractedColors: string[];
  activeTab: number;
  onTabChange: (tab: number) => void;
  // garment
  resetKey: number;
  onGarmentUpload: (file: File, previewUrl: string) => void;
  onGarmentClear: () => void;
  garmentImage: File | null;
  isRecoloring: boolean;
  recoloredImageUrl: string | null;
  garmentPreviewUrl: string | null;
  error: string | null;
  onRecolor: () => void;
  onDownload: () => void;
  onReset: () => void;
}

function SampleStrip({
  onSelectSample,
  onSkipToUpload,
  isExtracting,
  extractedColors,
  activeTab,
  onTabChange,
  resetKey,
  onGarmentUpload,
  onGarmentClear,
  garmentImage,
  isRecoloring,
  recoloredImageUrl,
  garmentPreviewUrl,
  error,
  onRecolor,
  onDownload,
  onReset,
}: SampleStripProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async (sample: Sample) => {
    setSelected(sample.label);
    setLoading(true);
    try {
      const response = await fetch(sample.src);
      const blob = await response.blob();
      const file = new File([blob], `${sample.label}.jpg`, { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      onSelectSample(file, url);
    } finally {
      setLoading(false);
    }
  };

  const hasColors = extractedColors.length > 0;
  const hasResult = !!(recoloredImageUrl && garmentPreviewUrl);

  return (
    <div className="sample-strip">
      <div className="strip-glass">
        {/* Tab bar */}
        <div className="tab-bar">
          <button
            className={`tab-btn${activeTab === 0 ? " active" : ""}`}
            onClick={() => onTabChange(0)}
          >
            pick yarn
          </button>
          <button
            className={`tab-btn${activeTab === 1 ? " active" : ""}${!hasColors ? " locked" : ""}`}
            onClick={() => hasColors && onTabChange(1)}
            disabled={!hasColors}
          >
            upload garment
          </button>
          <button
            className={`tab-btn${activeTab === 2 ? " active" : ""}${!hasResult ? " locked" : ""}`}
            onClick={() => hasResult && onTabChange(2)}
            disabled={!hasResult}
          >
            result
          </button>
        </div>

        {/* Tab 1: Pick yarn */}
        <div className="tab-content" style={{ display: activeTab === 0 ? "block" : "none" }}>
            <p className="strip-label">pick a yarn to get started</p>
            <p className="strip-sublabel">click a swatch to see it on a garment</p>
            <div className="strip-cards">
              {YARN_SAMPLES.map((sample) => (
                <div
                  key={sample.label}
                  className={`sample-card${selected === sample.label ? " selected" : ""}${loading && selected !== sample.label ? " dimmed" : ""}`}
                  onClick={() => !loading && handleClick(sample)}
                >
                  <img src={sample.src} alt={sample.label} />
                  <span className="sample-card-label">{sample.label}</span>
                </div>
              ))}
              <div
                className={`sample-card upload-card${loading ? " dimmed" : ""}`}
                onClick={() => !loading && onSkipToUpload()}
              >
                <span className="upload-card-plus">+</span>
                <span className="upload-card-text">your yarn</span>
              </div>
            </div>
            {isExtracting ? (
              <div className="strip-loading">
                <p className="curtain-message">gathering pixels...</p>
                <small className="curtain-subtitle">analysing your yarn colours</small>
                <div className="curtain-progress-wrap">
                  <div className="curtain-progress-fill" />
                </div>
              </div>
            ) : hasColors ? (
              <div className="strip-palette">
                <ColorPalette colors={extractedColors} />
              </div>
            ) : (
              <div className="strip-how">
                <span className="strip-how-step">
                  <span className="strip-how-icon">&#x1F9F6;</span> pick yarn
                </span>
                <span className="strip-how-arrow">&#x2192;</span>
                <span className="strip-how-step">
                  <span className="strip-how-icon">&#x1F3A8;</span> extract palette
                </span>
                <span className="strip-how-arrow">&#x2192;</span>
                <span className="strip-how-step">
                  <span className="strip-how-icon">&#x1F9E5;</span> recolour garment
                </span>
              </div>
            )}
        </div>

        {/* Tab 2: Upload garment */}
        <div className="tab-content" style={{ display: activeTab === 1 ? "block" : "none" }}>
            <p className="flow-title">upload your garment</p>
            <p className="flow-subtitle">a flat-lay photo works great</p>
            <UploadZone
              key={`garment-${resetKey}`}
              icon="&#x1F9E5;"
              heading="drop your garment photo here"
              subtitle="flat-lay or worn &middot; jpg or png"
              onFileSelect={onGarmentUpload}
              onClear={onGarmentClear}
              onRecolor={!recoloredImageUrl ? onRecolor : undefined}
              isRecoloring={isRecoloring}
              colors={extractedColors}
              samples={[
                { src: "/samples/garment-cardigan.jpg", label: "cardigan" },
                { src: "/samples/garment-baby.jpg", label: "baby knit" },
                { src: "/samples/garment-bag.jpg", label: "bag" },
                { src: "/samples/garment-bag-black.jpg", label: "black bag" },
                { src: "/samples/garment-bag-ivory.jpg", label: "ivory bag" },
              ]}
            />
            {isRecoloring && (
              <div className="strip-loading">
                <p className="curtain-message">recolouring your garment...</p>
                <small className="curtain-subtitle">removing background &amp; mapping colours</small>
                <div className="curtain-progress-wrap">
                  <div className="curtain-progress-fill" />
                </div>
              </div>
            )}
            {error && !isRecoloring && garmentImage && (
              <div className="error-msg">{error}</div>
            )}
        </div>

        {/* Tab 3: Result */}
        {hasResult && (
          <div className="tab-content" style={{ display: activeTab === 2 ? "block" : "none" }}>
            <p className="flow-title">before &amp; after</p>
            <p className="flow-subtitle">drag to compare — then go buy that yarn</p>
            <BeforeAfter
              beforeUrl={garmentPreviewUrl!}
              afterUrl={recoloredImageUrl!}
              onDownload={onDownload}
            />
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button className="btn-ghost" onClick={onReset}>
                start over
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SampleStrip;
