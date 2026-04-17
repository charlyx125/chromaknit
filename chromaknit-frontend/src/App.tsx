import { useEffect, useRef } from "react";
import { API_BASE_URL } from "./config";
import { useAppState } from "./hooks/useAppState";
import { useFetchWithAbort } from "./hooks/useFetchWithAbort";
import "./App.css";

import PetalBackground from "./components/PetalBackground";
import Header from "./components/Header";
import SampleStrip from "./components/SampleStrip";
import ReportIssue from "./components/ReportIssue";

function resizeImage(file: File, maxSize: number): Promise<File> {
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
}

function App() {
  const [state, dispatch] = useAppState();
  const { fetchWithAbort: extractFetch, abortCurrent: abortExtract } = useFetchWithAbort();
  const { fetchWithAbort: recolorFetch, abortCurrent: abortRecolor } = useFetchWithAbort();

  const sampleStripRef = useRef<HTMLDivElement>(null);

  // --- "Try it now" handler ---
  const handleStart = () => {
    dispatch({ type: "SHOW_STRIP" });
    setTimeout(() => {
      sampleStripRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // --- Sample selected from strip ---
  const handleSampleSelect = async (file: File, previewUrl: string) => {
    abortExtract();
    dispatch({ type: "CLEAR_FOR_NEW_YARN" });
    await handleYarnUpload(file, previewUrl);
  };

  // --- Change yarn (go back to swatch selection) ---
  const handleChangeYarn = () => {
    abortExtract();
    dispatch({ type: "CLEAR_FOR_NEW_YARN" });
  };

  // --- Yarn upload ---
  const handleYarnUpload = async (file: File, _previewUrl: string) => {
    const resized = await resizeImage(file, 400);
    dispatch({ type: "SET_YARN_IMAGE", file: resized });
  };

  // --- Garment upload ---
  const handleGarmentUpload = async (file: File, previewUrl: string) => {
    const resized = await resizeImage(file, 500);
    dispatch({ type: "SET_GARMENT", file: resized, previewUrl });
  };

  // --- Extract colors (auto-triggers on yarn upload) ---
  useEffect(() => {
    if (!state.yarnImage) return;

    let cancelled = false;

    const extractColors = async () => {
      dispatch({ type: "START_EXTRACTION" });

      try {
        const formData = new FormData();
        formData.append("file", state.yarnImage!);
        formData.append("n_colors", "10");

        const response = await extractFetch(`${API_BASE_URL}/api/colors/extract`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (!cancelled) {
          dispatch({
            type: "EXTRACTION_SUCCESS",
            colors: data.colors,
            percentages: data.percentages || [],
          });
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        dispatch({
          type: "EXTRACTION_ERROR",
          error: err instanceof Error ? err.message : "Failed to extract colors",
        });
      }
    };

    extractColors();

    return () => {
      cancelled = true;
      abortExtract();
    };
  }, [state.yarnImage]);

  // --- Recolor garment ---
  const handleRecolor = async () => {
    if (!state.garmentImage) {
      dispatch({ type: "SET_ERROR", error: "Please upload a garment image" });
      return;
    }
    if (state.extractedColors.length === 0) {
      dispatch({ type: "SET_ERROR", error: "Please upload yarn first to extract colors" });
      return;
    }

    dispatch({ type: "START_RECOLOR" });

    try {
      const formData = new FormData();
      formData.append("file", state.garmentImage);
      formData.append("colors", JSON.stringify(state.extractedColors));
      if (state.colorPercentages.length > 0) {
        formData.append("percentages", JSON.stringify(state.colorPercentages));
      }

      const response = await recolorFetch(`${API_BASE_URL}/api/garments/recolor`, {
        method: "POST",
        body: formData,
      });

      const blob = await response.blob();
      dispatch({ type: "RECOLOR_SUCCESS", imageUrl: URL.createObjectURL(blob) });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      dispatch({
        type: "RECOLOR_ERROR",
        error: err instanceof Error ? err.message : "Failed to recolor garment. Please try again.",
      });
      console.error("Recolor error:", err);
    }
  };

  // --- Download recolored image ---
  const handleDownload = () => {
    if (!state.recoloredImageUrl) return;
    const a = document.createElement("a");
    a.href = state.recoloredImageUrl;
    a.download = "chromaknit-recoloured.png";
    a.click();
  };

  // --- Reset ---
  const handleReset = () => {
    abortExtract();
    abortRecolor();
    dispatch({ type: "RESET" });
  };

  return (
    <>
      <a href="#main-content" className="sr-only focus-visible-only">Skip to main content</a>
      <PetalBackground />

      <Header onStart={handleStart} />

      {/* ---- SAMPLE STRIP (tabbed workspace) ---- */}
      {state.showSampleStrip && (
        <main id="main-content" ref={sampleStripRef}>
          <SampleStrip
            onSelectSample={handleSampleSelect}
            onChangeYarn={handleChangeYarn}
            isExtracting={state.isExtractingColors}
            extractedColors={state.extractedColors}
            activeTab={state.activeTab}
            onTabChange={(tab) => dispatch({ type: "SET_TAB", tab })}
            resetKey={state.resetKey}
            onGarmentUpload={handleGarmentUpload}
            onGarmentClear={() => {
              abortRecolor();
              dispatch({ type: "CLEAR_GARMENT" });
            }}
            garmentImage={state.garmentImage}
            isRecoloring={state.isRecoloring}
            recoloredImageUrl={state.recoloredImageUrl}
            garmentPreviewUrl={state.garmentPreviewUrl}
            error={state.error}
            onRecolor={handleRecolor}
            onDownload={handleDownload}
            onReset={handleReset}
          />
        </main>
      )}

      <ReportIssue />
    </>
  );
}

export default App;
