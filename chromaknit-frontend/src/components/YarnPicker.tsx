import { useEffect, useRef } from "react";
import "./YarnPicker.css";

interface Sample {
  src: string;
  // label is the slug-friendly key passed to the parent; it slugifies into
  // the filename under /samples/precomputed/yarns/. Keep this stable when
  // editing samples or precomputed JSON lookups will 404.
  label: string;
  // display + fiber are editorial-only. They never reach the backend; they
  // exist so the picker can match the romantic-portrait-book aesthetic
  // without renaming the precomputed files.
  display: string;
  fiber: string;
}

const YARN_SAMPLES: Sample[] = [
  { src: "/samples/yarn-mint.jpg",            label: "mint",         display: "Mint, soft",         fiber: "Cotton blend" },
  { src: "/samples/coral-pink-yarn.jpg",      label: "coral pink",   display: "Coral, washed",      fiber: "Merino, dk" },
  { src: "/samples/yarn-dark-blue.jpg",       label: "dark blue",    display: "Indigo, deep",       fiber: "Wool, worsted" },
  { src: "/samples/yarn-dark-green.jpg",      label: "forest green", display: "Forest, deep",       fiber: "Wool, dk" },
  { src: "/samples/yarn-mix-purple.jpg",      label: "soft purple",  display: "Heather, soft",      fiber: "Mohair blend" },
  { src: "/samples/yarn-red.png",             label: "coral red",    display: "Scarlet, hand-dyed", fiber: "Single ply" },
  { src: "/samples/cream-yarn.png",           label: "cream",        display: "Bone, raw",          fiber: "Aran weight" },
  { src: "/samples/yarn-pink-unknit.jpg",     label: "pink",         display: "Blush, pink",        fiber: "Sport" },
  { src: "/samples/yarn-light-blue.jpg",      label: "baby blue",    display: "Sky, washed",        fiber: "Cotton" },
  { src: "/samples/yarn-light-green.jpg",     label: "pastel green", display: "Spring, soft",       fiber: "Cotton" },
  { src: "/samples/grey-yarn.jpg",            label: "grey",         display: "Slate, grey",        fiber: "Worsted" },
  { src: "/samples/dark-red-purple-yarn.jpg", label: "plum",         display: "Plum, deep",         fiber: "Wool" },
];

interface YarnPickerProps {
  onYarnUpload: (file: File, label: string) => void;
  onYarnSampleSelect: (label: string, src: string) => void;
  onClose?: () => void;
}

function YarnPicker({ onYarnUpload, onYarnSampleSelect, onClose }: YarnPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ESC closes the picker. Bound once per mount so the listener does not
  // accumulate across renders.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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

  // Click on the scrim (target === currentTarget means the click landed on
  // the scrim itself, not bubbled up from the modal card) closes the picker.
  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose?.();
  };

  return (
    <div className="modal-stage" onClick={handleStageClick}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Close yarn picker"
          onClick={() => onClose?.()}
        >
          &#x2715;
        </button>

        <div className="modal-head">
          <div className="caps">A choice of yarn</div>
          <h3 id="picker-title">
            Choose a <em>yarn</em>
          </h3>
          <p>From our collection, or a photograph from your studio.</p>
        </div>

        <div className="modal-body">
          <div>
            <div className="modal-section-label">
              <h4>From our collection</h4>
            </div>
            <div className="sample-grid" role="group" aria-label="Yarn samples">
              {YARN_SAMPLES.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  className="sample-tile"
                  onClick={() => handleSampleClick(sample)}
                  aria-label={`Add ${sample.display} yarn`}
                >
                  <div className="sample-tile-thumb">
                    <img src={sample.src} alt="" />
                  </div>
                  <div className="sample-tile-name">{sample.display}</div>
                  <div className="sample-tile-sub">{sample.fiber}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="modal-rule" aria-hidden="true" />

          <div>
            <div className="modal-section-label">
              <h4>Or from your studio</h4>
            </div>
            <div
              className="upload-zone"
              role="button"
              tabIndex={0}
              onClick={handleUploadClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleUploadClick();
                }
              }}
              aria-label="Upload your own yarn photograph"
            >
              <div className="upload-mark">+</div>
              <h5>Drop a photograph</h5>
              <p>
                A snap of your shade card, a skein on a windowsill, or a colour
                you saw in a dream.
              </p>
              <span className="upload-button">Choose a file</span>
              <small className="upload-fineprint">JPG or PNG, up to 5 MB</small>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <small>Your photographs stay on your device until you submit.</small>
          <button type="button" className="modal-cancel" onClick={() => onClose?.()}>
            Cancel &amp; return
          </button>
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
    </div>
  );
}

export default YarnPicker;
