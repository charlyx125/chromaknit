import { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "./config";
import "./App.css";

import PetalBackground from "./components/PetalBackground";
import Header from "./components/Header";
import SampleStrip from "./components/SampleStrip";

function App() {
  const [resetKey, setResetKey] = useState(0);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState(0);

  // --- Yarn state ---
  const [yarnImage, setYarnImage] = useState<File | null>(null);
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [colorPercentages, setColorPercentages] = useState<number[]>([]);

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

  // --- UI state for sample strip ---
  const [showSampleStrip, setShowSampleStrip] = useState(false);
  const sampleStripRef = useRef<HTMLDivElement>(null);

  // --- "Try it now" handler ---
  const handleStart = () => {
    setShowSampleStrip(true);
    setTimeout(() => {
      sampleStripRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // --- Sample selected from strip ---
  const handleSampleSelect = async (file: File, previewUrl: string) => {
    extractAbortRef.current?.abort();
    setExtractedColors([]);
    setColorPercentages([]);
    setGarmentImage(null);
    setGarmentPreviewUrl(null);
    setRecoloredImageUrl(null);
    setError(null);
    setActiveTab(0);
    await handleYarnUpload(file, previewUrl);
  };

  // --- Upload own yarn (opens file picker directly) ---
  const uploadOwnRef = useRef<HTMLInputElement>(null);

  const handleSkipToUpload = () => {
    uploadOwnRef.current?.click();
  };

  const handleOwnFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setExtractedColors([]);
    setColorPercentages([]);
    setError(null);
    setActiveTab(0);
    await handleYarnUpload(file, url);
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
          setColorPercentages(data.percentages || []);
          setActiveTab(1);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Failed to extract colors");
        setExtractedColors([]);
        setColorPercentages([]);
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
      if (colorPercentages.length > 0) {
        formData.append("percentages", JSON.stringify(colorPercentages));
      }

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
      setActiveTab(2);
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
    setColorPercentages([]);
    setGarmentImage(null);
    setGarmentPreviewUrl(null);
    setRecoloredImageUrl(null);
    setError(null);
    setIsExtractingColors(false);
    setIsRecoloring(false);
    setActiveTab(0);
    setResetKey((prev) => prev + 1);
  };

  return (
    <>
      <PetalBackground />

      <Header onStart={handleStart} />

      {/* ---- SAMPLE STRIP (tabbed workspace) ---- */}
      {showSampleStrip && (
        <div ref={sampleStripRef}>
          <SampleStrip
            onSelectSample={handleSampleSelect}
            onSkipToUpload={handleSkipToUpload}
            isExtracting={isExtractingColors}
            extractedColors={extractedColors}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            resetKey={resetKey}
            onGarmentUpload={handleGarmentUpload}
            onGarmentClear={() => {
              recolorAbortRef.current?.abort();
              setGarmentImage(null);
              setGarmentPreviewUrl(null);
              setRecoloredImageUrl(null);
              setIsRecoloring(false);
              setError(null);
            }}
            garmentImage={garmentImage}
            isRecoloring={isRecoloring}
            recoloredImageUrl={recoloredImageUrl}
            garmentPreviewUrl={garmentPreviewUrl}
            error={error}
            onRecolor={handleRecolor}
            onDownload={handleDownload}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Hidden file input for "upload your own yarn" */}
      <input
        ref={uploadOwnRef}
        type="file"
        accept="image/*"
        onChange={handleOwnFileChange}
        style={{ display: "none" }}
      />
    </>
  );
}

export default App;
