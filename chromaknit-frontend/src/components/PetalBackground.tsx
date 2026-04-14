import { useEffect, useRef } from "react";
import "./PetalBackground.css";

const COLORS = ["#E87B8B", "#C9B8D8", "#A8C8DC", "#9BB89A", "#F0A882", "#F2AEBC", "#D4A843"];
const PETAL_COUNT = 24;

function PetalBackground() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    for (let i = 0; i < PETAL_COUNT; i++) {
      const petal = document.createElement("div");
      petal.className = "petal";
      const size = 7 + Math.random() * 9;
      petal.style.left = `${Math.round(Math.random() * 100)}%`;
      petal.style.width = `${Math.round(size)}px`;
      petal.style.height = `${Math.round(size * 1.5)}px`;
      petal.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      petal.style.animationDuration = `${(6 + Math.random() * 8).toFixed(1)}s`;
      petal.style.animationDelay = `${(Math.random() * 12).toFixed(1)}s`;
      layer.appendChild(petal);
    }

    return () => {
      while (layer.firstChild) {
        layer.removeChild(layer.firstChild);
      }
    };
  }, []);

  return (
    <div aria-hidden="true">
      <div className="header-bg" />
      <div className="header-overlay" />
      <div className="petals-layer" ref={layerRef} />
    </div>
  );
}

export default PetalBackground;
