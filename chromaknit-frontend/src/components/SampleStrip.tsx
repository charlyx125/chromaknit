import { useState, useRef, useEffect } from "react";
import ColorPalette from "./ColorPalette";
import UploadZone from "./UploadZone";
import BeforeAfter from "./BeforeAfter";
import "./SampleStrip.css";

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
  onChangeYarn: () => void;
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
  onChangeYarn,
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
  const [yarnPreview, setYarnPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset local state when the app resets
  useEffect(() => {
    setSelected(null);
    setYarnPreview(null);
    setLoading(false);
    setConfirmReset(false);
  }, [resetKey]);

  const handleClick = async (sample: Sample) => {
    setSelected(sample.label);
    setYarnPreview(sample.src);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setSelected("your yarn");
    setYarnPreview(previewUrl);
    onSelectSample(file, previewUrl);
    e.target.value = "";
  };

  const handleChangeYarn = () => {
    setSelected(null);
    setYarnPreview(null);
    onChangeYarn();
  };

  const hasColors = extractedColors.length > 0;
  const hasResult = !!(recoloredImageUrl && garmentPreviewUrl);

  return (
    <div className="sample-strip">
      {/* Decorative squiggles */}
      <div className="strip-decor" aria-hidden="true">
        <svg className="strip-squig strip-squig-left" width="40" height="200" viewBox="0 0 40 200" fill="none">
          <path d="M20 0 Q40 25 20 50 Q0 75 20 100 Q40 125 20 150 Q0 175 20 200" stroke="var(--blush)" strokeWidth="4" strokeLinecap="round" fill="none" />
        </svg>
        <svg className="strip-squig strip-squig-right" width="40" height="200" viewBox="0 0 40 200" fill="none">
          <path d="M20 0 Q0 25 20 50 Q40 75 20 100 Q0 125 20 150 Q40 175 20 200" stroke="var(--lavender)" strokeWidth="4" strokeLinecap="round" fill="none" />
        </svg>
        <svg className="strip-squig strip-squig-flower" width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="6" fill="var(--mustard)" opacity="0.6" />
          <circle cx="24" cy="13" r="5" fill="var(--rose)" opacity="0.35" />
          <circle cx="33" cy="19" r="5" fill="var(--rose)" opacity="0.35" />
          <circle cx="33" cy="29" r="5" fill="var(--rose)" opacity="0.35" />
          <circle cx="24" cy="35" r="5" fill="var(--rose)" opacity="0.35" />
          <circle cx="15" cy="29" r="5" fill="var(--rose)" opacity="0.35" />
          <circle cx="15" cy="19" r="5" fill="var(--rose)" opacity="0.35" />
        </svg>
        <svg className="strip-squig strip-squig-star" width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 1 L17 10 L26 10 L19 16 L21 25 L14 20 L7 25 L9 16 L2 10 L11 10Z" fill="var(--mustard)" opacity="0.35" />
        </svg>
      </div>

      <div className="strip-glass">
        {/* Tab bar with step numbers */}
        <div className="tab-bar" role="tablist" aria-label="Workflow steps">
          <button
            role="tab"
            id="tab-yarn"
            aria-selected={activeTab === 0}
            aria-controls="tabpanel-yarn"
            className={`tab-btn${activeTab === 0 ? " active" : ""}`}
            onClick={() => onTabChange(0)}
          >
            <span className="tab-step">1</span>
            pick yarn
          </button>
          <span className="tab-divider" aria-hidden="true" />
          <button
            role="tab"
            id="tab-garment"
            aria-selected={activeTab === 1}
            aria-controls="tabpanel-garment"
            className={`tab-btn${activeTab === 1 ? " active" : ""}${!hasColors ? " locked" : ""}`}
            onClick={() => hasColors && onTabChange(1)}
            disabled={!hasColors}
            aria-disabled={!hasColors}
          >
            <span className="tab-step">2</span>
            upload garment
          </button>
          <span className="tab-divider" aria-hidden="true" />
          <button
            role="tab"
            id="tab-result"
            aria-selected={activeTab === 2}
            aria-controls="tabpanel-result"
            className={`tab-btn${activeTab === 2 ? " active" : ""}${!hasResult ? " locked" : ""}`}
            onClick={() => hasResult && onTabChange(2)}
            disabled={!hasResult}
            aria-disabled={!hasResult}
          >
            <span className="tab-step">3</span>
            result
          </button>
        </div>

        {/* Tab 1: Pick yarn */}
        <div className="tab-content" role="tabpanel" id="tabpanel-yarn" aria-labelledby="tab-yarn" style={{ display: activeTab === 0 ? "block" : "none" }}>
          {hasColors ? (
            <>
              {yarnPreview && (
                <div className="yarn-selected">
                  <img src={yarnPreview} alt="Selected yarn" className="yarn-selected-thumb" />
                  <span className="yarn-selected-label">{selected}</span>
                  <button className="yarn-change-btn" onClick={handleChangeYarn}>change</button>
                </div>
              )}
              <div className="strip-palette">
                <ColorPalette colors={extractedColors} />
                <button className="next-step-btn" onClick={() => onTabChange(1)}>
                  next: upload your garment
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8 L11 8 M8 4 L12 8 L8 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="strip-label">pick a yarn to get started</p>
              <p className="strip-sublabel">pick a swatch or upload your own</p>
              <div className="strip-cards" role="group" aria-label="Yarn samples">
                {/* Upload your own — first position */}
                <div
                  role="button"
                  tabIndex={loading ? -1 : 0}
                  aria-label="Upload your own yarn image"
                  className={`sample-card upload-card${loading ? " dimmed" : ""}`}
                  onClick={() => !loading && fileInputRef.current?.click()}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !loading) { e.preventDefault(); fileInputRef.current?.click(); } }}
                >
                  <span className="upload-card-plus" aria-hidden="true">+</span>
                  <span className="upload-card-text">upload yours</span>
                </div>
                {YARN_SAMPLES.map((sample) => (
                  <div
                    key={sample.label}
                    role="button"
                    tabIndex={loading && selected !== sample.label ? -1 : 0}
                    aria-label={`Select ${sample.label} yarn`}
                    aria-pressed={selected === sample.label}
                    className={`sample-card${selected === sample.label ? " selected" : ""}${loading && selected !== sample.label ? " dimmed" : ""}`}
                    onClick={() => !loading && handleClick(sample)}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !loading) { e.preventDefault(); handleClick(sample); } }}
                  >
                    <img src={sample.src} alt={`${sample.label} yarn swatch`} />
                    <span className="sample-card-label">{sample.label}</span>
                  </div>
                ))}
              </div>
              {isExtracting ? (
                <div className="strip-loading" role="status" aria-live="polite">
                  <p className="curtain-message">gathering pixels...</p>
                  <small className="curtain-subtitle">analysing your yarn colours &middot; usually 3-7 seconds</small>
                  <div className="curtain-progress-wrap">
                    <div className="curtain-progress-fill" />
                  </div>
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
            </>
          )}
          {/* Hidden file input for upload your own */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Upload your own yarn image"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>

        {/* Tab 2: Upload garment */}
        <div className="tab-content" role="tabpanel" id="tabpanel-garment" aria-labelledby="tab-garment" style={{ display: activeTab === 1 ? "block" : "none" }}>
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
              <div className="strip-loading" role="status" aria-live="polite">
                <p className="curtain-message">recolouring your garment...</p>
                <small className="curtain-subtitle">removing background &amp; mapping colours &middot; usually 5-10 seconds</small>
                <div className="curtain-progress-wrap">
                  <div className="curtain-progress-fill" />
                </div>
              </div>
            )}
            {!isRecoloring && hasResult && (
              <button className="next-step-btn" onClick={() => onTabChange(2)}>
                see your result
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8 L11 8 M8 4 L12 8 L8 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {error && !isRecoloring && garmentImage && (
              <div className="error-msg" role="alert">Something went wrong processing your image — try a clearer photo or a smaller file.</div>
            )}
        </div>

        {/* Tab 3: Result */}
        {hasResult && (
          <div className="tab-content" role="tabpanel" id="tabpanel-result" aria-labelledby="tab-result" style={{ display: activeTab === 2 ? "block" : "none" }}>
            <p className="flow-title">before &amp; after</p>
            <p className="flow-subtitle">drag the slider to compare</p>
            <BeforeAfter
              beforeUrl={garmentPreviewUrl!}
              afterUrl={recoloredImageUrl!}
              onDownload={onDownload}
            />
            <div style={{ textAlign: "center", marginTop: 20 }}>
              {!confirmReset ? (
                <button className="btn-ghost" onClick={() => setConfirmReset(true)}>
                  start over
                </button>
              ) : (
                <div className="reset-confirm">
                  <span className="reset-confirm-text">this will clear everything</span>
                  <button className="btn-ghost reset-yes" onClick={() => { setConfirmReset(false); onReset(); }}>
                    yes, reset
                  </button>
                  <button className="btn-ghost" onClick={() => setConfirmReset(false)}>
                    cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SampleStrip;
