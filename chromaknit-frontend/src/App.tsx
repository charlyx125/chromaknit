import { useState, useEffect } from "react";
import ImageUpload from "./ImageUpload";
import "./App.css";

function App() {
  const [yarnImage, setYarnImage] = useState<File | null>(null);
  const [yarnPreviewUrl, setYarnPreviewUrl] = useState<string | null>(null);
  const [isExtractingColors, setIsExtractingColors] = useState<boolean>(false);
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const [garmentImage, setGarmentImage] = useState<File | null>(null);
  const [garmentPreviewUrl, setGarmentPreviewUrl] = useState<string | null>(null);
  const [isRecoloring, setIsRecoloring] = useState<boolean>(false);
  const [recoloredImageUrl, setRecoloredImageUrl] = useState<string | null>(
    null
  );

  const handleYarnUpload = (file: File, previewUrl: string) => {
    setYarnImage(file);
    setYarnPreviewUrl(previewUrl);
    setError(null);
  };

  const handleGarmentUpload = (file: File, previewUrl: string) => {
    setGarmentImage(file);
    setGarmentPreviewUrl(previewUrl);
    setRecoloredImageUrl(null);
    setError(null);
  };

  const handleReset = () => {
    setYarnImage(null);
    setYarnPreviewUrl(null);
    setExtractedColors([]);
    setGarmentImage(null);
    setGarmentPreviewUrl(null);
    setRecoloredImageUrl(null);
    setError(null);
    setResetKey((prev) => prev + 1);
  };

  const handleRecolor = async () => {
    if (!garmentImage) {
      setError("Please upload a garment image");
      return;
    }

    if (extractedColors.length === 0) {
      setError("Please upload yarn first to extract colors");
      return;
    }

    setIsRecoloring(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", garmentImage);
      formData.append("colors", JSON.stringify(extractedColors));

      const response = await fetch(
        "http://localhost:8000/api/garments/recolor",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      setRecoloredImageUrl(imageUrl);
    } catch (error) {
      setError("Failed to recolor garment. Please try again.");
      console.error("Recolor error:", error);
    } finally {
      setIsRecoloring(false);
    }
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
            key={`yarn-${resetKey}`}
            label="Drop yarn image here"
            onImageSelect={handleYarnUpload}
            showPreview={false}
          />

          {yarnImage && (
            <p className="upload-success">✅ Uploaded: {yarnImage.name}</p>
          )}

          {isExtractingColors && <p>⏳ Extracting colors...</p>}

          {yarnPreviewUrl && extractedColors.length > 0 && (
            <div className="yarn-colors-container">
              <img
                src={yarnPreviewUrl}
                alt="Yarn preview"
                className="yarn-preview"
              />
              <div className="extracted-colors">
                <h3>Extracted Colors:</h3>
                <div className="color-palette-vertical">
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
            </div>
          )}

          {error && <div className="error">❌ Error: {error}</div>}
        </section>

        {extractedColors.length > 0 && (
          <section className="step">
            <h2>Step 2: Upload Garment Photo</h2>

            <ImageUpload
              key={`garment-${resetKey}`}
              label="Drop garment image here"
              onImageSelect={handleGarmentUpload}
              showPreview={false}
            />

            {garmentImage && (
              <p className="upload-success">✅ Uploaded: {garmentImage.name}</p>
            )}

            <button
              className="action-button"
              onClick={handleRecolor}
              disabled={
                !garmentImage || extractedColors.length === 0 || isRecoloring
              }
            >
              {isRecoloring ? "⏳ Recoloring..." : "🎨 Recolor Garment"}
            </button>

            {garmentPreviewUrl && (
              <div className="garment-result-container">
                <div className="garment-image-wrapper">
                  <h3>Original:</h3>
                  <img
                    src={garmentPreviewUrl}
                    alt="Garment preview"
                    className="garment-preview"
                  />
                </div>
                {recoloredImageUrl && (
                  <div className="garment-image-wrapper">
                    <h3>Recolored:</h3>
                    <img
                      src={recoloredImageUrl}
                      alt="Recolored garment"
                      className="garment-preview"
                    />
                  </div>
                )}
              </div>
            )}

            {error && <div className="error">❌ Error: {error}</div>}
          </section>
        )}

        {yarnImage && (
          <button className="reset-button" onClick={handleReset}>
            🔄 Start Over
          </button>
        )}
      </main>
    </div>
  );
}

export default App;
