import { useState } from "react";

interface InfoPanelProps {
  shortText: string;
  detail: string;
}

function InfoPanel({ shortText, detail }: InfoPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="step-short">
        <span>{shortText}</span>
        <button
          className="info-btn"
          onClick={() => setOpen(!open)}
          title="more info"
        >
          i
        </button>
      </div>
      <div className={`info-panel${open ? " open" : ""}`}>
        <div className="info-content">{detail}</div>
      </div>
    </>
  );
}

export default InfoPanel;
