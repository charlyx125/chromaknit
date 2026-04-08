import { useState, useRef, useCallback } from "react";

interface BeforeAfterProps {
  beforeUrl: string;
  afterUrl: string;
  onDownload: () => void;
}

function BeforeAfter({ beforeUrl, afterUrl, onDownload }: BeforeAfterProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  const onMouseDown = () => { draggingRef.current = true; };
  const onMouseUp = () => { draggingRef.current = false; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (draggingRef.current) updatePosition(e.clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    updatePosition(e.touches[0].clientX);
  };

  return (
    <div className="slider-card">
      <h3>your result</h3>
      <div
        className="ba-container"
        ref={containerRef}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
      >
        <div className="ba-before">
          <img src={beforeUrl} alt="Original garment" />
        </div>
        <div
          className="ba-after"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        >
          <img src={afterUrl} alt="Recoloured garment" />
        </div>
        <div className="ba-divider" style={{ left: `${position}%` }} />
        <div className="ba-handle" style={{ left: `${position}%` }}>
          &#x25C0;&#x25B6;
        </div>
        <span className="ba-lbl left">original</span>
        <span className="ba-lbl right">recoloured</span>
      </div>
      <input
        type="range"
        className="range-input"
        min="0"
        max="100"
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
      />
      <div className="btn-row">
        <button className="btn-dl" onClick={onDownload}>
          &#x2B07; download
        </button>
        <button className="btn-ghost" onClick={onDownload}>
          share
        </button>
      </div>
    </div>
  );
}

export default BeforeAfter;
