import { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "./config";
import "./App.css";

import PetalBackground from "./components/PetalBackground";
import Header from "./components/Header";
import StepSection from "./components/StepSection";
import InfoPanel from "./components/InfoPanel";
import UploadZone from "./components/UploadZone";
import ColorPalette from "./components/ColorPalette";
import LoadingCat from "./components/LoadingCat";
import BeforeAfter from "./components/BeforeAfter";

function App() {
  // --- UI state ---
  const [showSteps, setShowSteps] = useState(false);
  const stepsRef = useRef<HTMLDivElement>(null);

  const [resetKey, setResetKey] = useState(0);

  // --- Yarn state ---
  const [yarnImage, setYarnImage] = useState<File | null>(null);
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [extractedColors, setExtractedColors] = useState<string[]>([]);

  // --- Garment state ---
  const [garmentImage, setGarmentImage] = useState<File | null>(null);
  const [garmentPreviewUrl, setGarmentPreviewUrl] = useState<string | null>(null);
  const [isRecoloring, setIsRecoloring] = useState(false);
  const [recoloredImageUrl, setRecoloredImageUrl] = useState<string | null>(null);

  // --- Error state ---
  const [error, setError] = useState<string | null>(null);

  // --- Abort controllers ---
  const extractAbortRef = useRef<AbortController | null>(null);
  const recolorAbortRef = useRef<AbortController | null>(null);

  // --- Image resize helper ---
  const resizeImage = (file: File, maxSize: number): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.width <= maxSize && img.height <= maxSize) {
          resolve(file);
          return;
        }
        const scale = maxSize / Math.max(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            resolve(new File([blob!], file.name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.9
        );
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // --- "Try it now" handler ---
  const handleStart = () => {
    setShowSteps(true);
    setTimeout(() => {
      stepsRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // --- Yarn upload ---
  const handleYarnUpload = async (file: File, _previewUrl: string) => {
    const resized = await resizeImage(file, 400);
    setYarnImage(resized);
    setError(null);
  };

  // --- Garment upload ---
  const handleGarmentUpload = async (file: File, previewUrl: string) => {
    const resized = await resizeImage(file, 500);
    setGarmentImage(resized);
    setGarmentPreviewUrl(previewUrl);
    setRecoloredImageUrl(null);
    setError(null);
  };

  // --- Extract colors (auto-triggers on yarn upload) ---
  useEffect(() => {
    if (!yarnImage) return;

    let cancelled = false;
    extractAbortRef.current?.abort();
    const controller = new AbortController();
    extractAbortRef.current = controller;

    const extractColors = async () => {
      setIsExtractingColors(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", yarnImage);

        const response = await fetch(`${API_BASE_URL}/api/colors/extract`, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        if (!cancelled) {
          setExtractedColors(data.colors);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Failed to extract colors");
        setExtractedColors([]);
      } finally {
        if (!cancelled) {
          setIsExtractingColors(false);
        }
      }
    };

    extractColors();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [yarnImage]);

  // --- Recolor garment ---
  const handleRecolor = async () => {
    if (!garmentImage) {
      setError("Please upload a garment image");
      return;
    }
    if (extractedColors.length === 0) {
      setError("Please upload yarn first to extract colors");
      return;
    }

    recolorAbortRef.current?.abort();
    const controller = new AbortController();
    recolorAbortRef.current = controller;

    setIsRecoloring(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", garmentImage);
      formData.append("colors", JSON.stringify(extractedColors));

      const response = await fetch(`${API_BASE_URL}/api/garments/recolor`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      setRecoloredImageUrl(imageUrl);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to recolor garment. Please try again.");
      console.error("Recolor error:", err);
    } finally {
      setIsRecoloring(false);
    }
  };

  // --- Download recolored image ---
  const handleDownload = () => {
    if (!recoloredImageUrl) return;
    const a = document.createElement("a");
    a.href = recoloredImageUrl;
    a.download = "chromaknit-recoloured.png";
    a.click();
  };

  // --- Reset ---
  const handleReset = () => {
    extractAbortRef.current?.abort();
    recolorAbortRef.current?.abort();
    setYarnImage(null);
    setExtractedColors([]);
    setGarmentImage(null);
    setGarmentPreviewUrl(null);
    setRecoloredImageUrl(null);
    setError(null);
    setIsExtractingColors(false);
    setIsRecoloring(false);
    setShowSteps(false);
    setResetKey((prev) => prev + 1);
  };

  return (
    <>
      <PetalBackground />

      <Header onStart={handleStart} />

      {/* ---- STEPS ---- */}
      <div
        ref={stepsRef}
        className={`steps-wrap ${showSteps ? "visible" : "hidden"}`}
      >
        {/* STEP 1 — Upload Yarn + Palette */}
        <StepSection
          number={1}
          label="step one"
          title={<>upload your <em>yarn</em></>}
        >
          <InfoPanel
            shortText="a photo of your yarn is all you need"
            detail="ChromaKnit analyses colours using K-means clustering. The messier and more textured the yarn, the better! This ensures we capture the full range of your palette."
          />
          <UploadZone
            key={`yarn-${resetKey}`}
            icon="&#x1FAA2;"
            heading="drop your yarn photo here"
            subtitle="jpg or png &middot; up to 5MB"
            onFileSelect={handleYarnUpload}
            onClear={() => {
              extractAbortRef.current?.abort();
              setYarnImage(null);
              setExtractedColors([]);
              setIsExtractingColors(false);
              setError(null);
            }}
          />
          {isExtractingColors && (
            <LoadingCat
              message="gathering pixels..."
              subtitle="analysing your yarn colours"
            />
          )}
          {error && !isExtractingColors && extractedColors.length === 0 && (
            <div className="error-msg">{error}</div>
          )}
          {extractedColors.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <ColorPalette colors={extractedColors} />
            </div>
          )}
        </StepSection>

        {/* STEP 2 — Upload Garment (visible after colors extracted) */}
        {extractedColors.length > 0 && (
          <>
            <StepSection
              number={2}
              label="step two"
              title={<>upload your <em>garment</em></>}
            >
              <InfoPanel
                shortText="a flat-lay photo works great!"
                detail="ChromaKnit uses background removal (rembg) to isolate your garment, then maps the yarn palette onto it using HSV colour space transformation."
              />
              <UploadZone
                key={`garment-${resetKey}`}
                icon="&#x1F9E5;"
                heading="drop your garment photo here"
                subtitle="flat-lay or worn &middot; jpg or png"
                onFileSelect={handleGarmentUpload}
                onClear={() => {
                  recolorAbortRef.current?.abort();
                  setGarmentImage(null);
                  setGarmentPreviewUrl(null);
                  setRecoloredImageUrl(null);
                  setIsRecoloring(false);
                  setError(null);
                }}
              />
              {garmentImage && !isRecoloring && !recoloredImageUrl && (
                <div style={{ textAlign: "center", marginTop: 18 }}>
                  <button className="btn-primary" onClick={handleRecolor}>
                    &#x1F3A8; recolour garment
                  </button>
                </div>
              )}
              {isRecoloring && (
                <LoadingCat
                  message="recolouring your garment..."
                  subtitle="this takes just a moment"
                  showCat
                />
              )}
              {error && !isRecoloring && garmentImage && (
                <div className="error-msg">{error}</div>
              )}
            </StepSection>
          </>
        )}

        {/* STEP 3 — Before & After (visible after recolor) */}
        {recoloredImageUrl && garmentPreviewUrl && (
          <>
            <StepSection
              number={3}
              label="step three"
              title={<>before <em>&amp; after</em></>}
            >
              <div className="step-short">
                <span>drag to compare — then go buy that yarn</span>
              </div>
              <BeforeAfter
                beforeUrl={garmentPreviewUrl}
                afterUrl={recoloredImageUrl}
                onDownload={handleDownload}
              />
            </StepSection>
          </>
        )}

        {/* Reset */}
        {recoloredImageUrl && (
          <div className="reset-row">
            <button className="btn-ghost" onClick={handleReset}>
              start over
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
