import { useState } from "react";
import "./BuilderNotes.css";

function BuilderNotes() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={`dev-toggle${open ? " open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="builder-notes-panel"
      >
        builder notes <span className="arrow" aria-hidden="true">&#x25BE;</span>
      </button>
      <div className={`dev-panel${open ? " open" : ""}`} id="builder-notes-panel" role="region" aria-label="Builder notes">
        <div className="dev-inner">
          <p className="dev-section-title">tech stack</p>
          <div className="dev-pills">
            <span className="dev-pill">FastAPI</span>
            <span className="dev-pill">React + TypeScript</span>
            <span className="dev-pill">K-means clustering</span>
            <span className="dev-pill">HSV colour space</span>
            <span className="dev-pill">rembg</span>
            <span className="dev-pill">Render + Vercel</span>
          </div>
          <p className="dev-section-title">performance</p>
          <div className="dev-stats">
            <div className="dev-stat">
              <span className="dev-stat-num">3-7s</span>
              <span className="dev-stat-lbl">colour extraction</span>
            </div>
            <div className="dev-stat">
              <span className="dev-stat-num">~1.8s</span>
              <span className="dev-stat-lbl">garment recolour</span>
            </div>
            <div className="dev-stat">
              <span className="dev-stat-num">99%</span>
              <span className="dev-stat-lbl">test coverage</span>
            </div>
          </div>
          <p className="dev-note">
            Recolour time nearly constant regardless of image size — dominated
            by rembg model loading (~1.5s). Deployed Render free tier + Vercel.
            Cold starts ~30-60s after 15 min inactivity. ADRs in{" "}
            <code>docs/decisions/</code>
          </p>
        </div>
      </div>
    </>
  );
}

export default BuilderNotes;
