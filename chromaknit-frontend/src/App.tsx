import { useState, useEffect } from "react";
import ImageUpload from "./ImageUpload";
import "./App.css";

function App() {
  const [yarnImage, setYarnImage] = useState<File | null>(null);
  const [isExtractingColors, setIsExtractingColors] = useState<boolean>(false);
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleYarnUpload = (file: File) => {
    setYarnImage(file);
    setError(null);
  };

  useEffect(() => {
    if (!yarnImage) return;

    const extractColors = async () => {
      setIsExtractingColors(true);
      setError(null); // Clear previous errors

      try {
        const formData = new FormData();
        formData.append("file", yarnImage);

        const response = await fetch(
          "http://localhost:8000/api/colors/extract",
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        setExtractedColors(data.colors);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to extract colors"
        );
        setExtractedColors([]); // Clear colors on error
      } finally {
        setIsExtractingColors(false); // ← Always runs, even if error
      }
    };

    extractColors();
  }, [yarnImage]);

  return (
    <div className="app">
      <header>
        <h1>🧶 ChromaKnit</h1>
        <p>Preview yarn colors on garments before buying</p>
      </header>

      <main>
        <section className="step">
          <h2>Step 1: Upload Yarn Photo</h2>

          <ImageUpload
            label="Drop yarn image here"
            onImageSelect={handleYarnUpload}
          />

          {yarnImage && (
            <p style={{ marginTop: "1rem", color: "#4ECDC4" }}>
              ✅ Uploaded: {yarnImage.name}
            </p>
          )}

          {isExtractingColors && <p>⏳ Extracting colors...</p>}

          {extractedColors.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <h3>Extracted Colors:</h3>
              <div className="color-palette">
                {extractedColors.map((color, index) => (
                  <div
                    key={index}
                    className="color-box"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}

          {error && <div className="error">❌ Error: {error}</div>}
        </section>
      </main>
    </div>
  );
}

export default App;
