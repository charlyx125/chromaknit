import { useState } from "react";

interface Sample {
  src: string;
  label: string;
}

const YARN_SAMPLES: Sample[] = [
  { src: "/samples/yarn-blue.jpg", label: "blue" },
  { src: "/samples/yarn-green.jpg", label: "green" },
  { src: "/samples/yarn-pink.jpg", label: "pink" },
  { src: "/samples/yarn-purple.jpg", label: "purple" },
  { src: "/samples/yarn-dark-green.jpg", label: "dark green" },
  { src: "/samples/yarn-light-blue.jpg", label: "light blue" },
  { src: "/samples/yarn-light-green.jpg", label: "sage" },
];

interface SampleStripProps {
  onSelectSample: (file: File, previewUrl: string) => void;
  onSkipToUpload: () => void;
}

function SampleStrip({ onSelectSample, onSkipToUpload }: SampleStripProps) {
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

  return (
    <div className="sample-strip">
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
      </div>
      <p className="strip-or">
        or{" "}
        <span className="strip-upload-link" onClick={onSkipToUpload}>
          upload your own yarn
        </span>
      </p>
    </div>
  );
}

export default SampleStrip;
