import { useRef, useState } from "react";
import { API_BASE_URL } from "./config";
import { useAppState } from "./hooks/useAppState";
import "./App.css";

import PetalBackground from "./components/PetalBackground";
import Header from "./components/Header";
import YarnPalette from "./components/YarnPalette";
import YarnPicker from "./components/YarnPicker";
import ReportIssue from "./components/ReportIssue";

function resizeImage(file: File, maxSize: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
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
          if (!blob) {
            reject(new Error("Could not encode resized image"));
            return;
          }
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.9,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image. The file may be corrupted or not a supported format."));
    };
    img.src = objectUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file as data URL"));
    reader.readAsDataURL(file);
  });
}

function App() {
  const [state, dispatch] = useAppState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const abortersRef = useRef<Map<string, AbortController>>(new Map());

  // First-run helper: reveal the palette stage AND open the picker so the
  // user lands directly on something actionable. Subsequent picker opens
  // come from the YarnPalette "+" tile.
  const handleStart = () => {
    dispatch({ type: "SHOW_STRIP" });
    setPickerOpen(true);
  };

  const handleYarnAdd = async (
    file: File,
    label: string,
    source: "sample" | "upload",
    originalSrc?: string,
  ) => {
    const id = crypto.randomUUID();
    const controller = new AbortController();
    abortersRef.current.set(id, controller);

    try {
      const resized = await resizeImage(file, 400);
      const previewUrl =
        source === "sample" && originalSrc
          ? originalSrc
          : await fileToDataUrl(resized);

      dispatch({ type: "ADD_YARN_PENDING", id, label, previewUrl });

      const formData = new FormData();
      formData.append("file", resized);
      formData.append("n_colors", "10");

      const response = await fetch(`${API_BASE_URL}/api/colors/extract`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Extraction failed (HTTP ${response.status})`);
      }

      const data = await response.json();
      dispatch({
        type: "ADD_YARN_SUCCESS",
        id,
        palette: data.colors,
        percentages: data.percentages || [],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errorMessage =
        err instanceof Error ? err.message : "Failed to extract colours";
      dispatch({ type: "ADD_YARN_ERROR", id, errorMessage });
    } finally {
      abortersRef.current.delete(id);
    }
  };

  const handleYarnRemove = (id: string) => {
    const controller = abortersRef.current.get(id);
    controller?.abort();
    abortersRef.current.delete(id);
    dispatch({ type: "REMOVE_YARN", id });
  };

  return (
    <>
      <a href="#main-content" className="sr-only focus-visible-only">
        Skip to main content
      </a>
      <PetalBackground />
      <Header onStart={handleStart} />
      {state.showSampleStrip && (
        <main id="main-content" className="palette-stage">
          <YarnPalette
            yarns={state.yarns}
            activeYarnId={state.activeYarnId}
            onSelect={(id) => dispatch({ type: "SET_ACTIVE_YARN", id })}
            onRemove={handleYarnRemove}
            onAdd={() => setPickerOpen(true)}
          />
          {pickerOpen && (
            <YarnPicker
              onYarnAdd={handleYarnAdd}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </main>
      )}
      <ReportIssue />
    </>
  );
}

export default App;
