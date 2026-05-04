import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "./config";
import { useAppState } from "./hooks/useAppState";
import { computeGarmentBrightnessRange } from "./lib/recolourLocal";
import "./App.css";

import PetalBackground from "./components/PetalBackground";
import Header from "./components/Header";
import YarnPalette from "./components/YarnPalette";
import YarnPicker from "./components/YarnPicker";
import GarmentStage from "./components/GarmentStage";
import ModeToolbar from "./components/ModeToolbar";
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

// Decode a base64-encoded PNG mask into a 1-channel Uint8Array. The PNG is
// drawn to an off-screen canvas, then the red channel is extracted (the
// server encodes a single-channel grayscale PNG, which the browser surfaces
// with R = G = B).
async function decodeMaskPngBase64(base64: string): Promise<Uint8Array> {
  const img = new Image();
  img.src = `data:image/png;base64,${base64}`;
  await img.decode();
  const off = document.createElement("canvas");
  off.width = img.width;
  off.height = img.height;
  const ctx = off.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context for mask decode");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4];
  return out;
}

// Read the original garment image into an RGBA pixel buffer at the given
// canvas dimensions. Used to compute the foreground brightness range once
// per session so paint mode strokes share the same normalisation window.
async function readGarmentImageRgba(
  blobUrl: string,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const img = new Image();
  img.src = blobUrl;
  await img.decode();
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const ctx = off.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context for image read");
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function App() {
  const [state, dispatch] = useAppState();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Ref on the palette-stage <main> so handleStart can scroll it into view
  // after the reveal. The header is min-height: 100vh, so the new content
  // is below the fold otherwise and the click looks like a no-op.
  const stageRef = useRef<HTMLElement>(null);

  // Per-yarn extraction abort controllers. Refs because they are not
  // render-driving state.
  const extractAbortersRef = useRef<Map<string, AbortController>>(new Map());

  // Per-yarn recolour blob URL cache. Key: yarn id, value: blob URL.
  // Refs because Map mutations would not trigger re-renders even with state;
  // the user-visible "current recolour" lives in state.currentRecolorUrl,
  // which we update from this cache on hits and from the API on misses.
  const recolorCacheRef = useRef<Map<string, string>>(new Map());

  // Abort controller for the in-flight recolour fetch. Refs for the same
  // reason as above.
  const recolorAbortRef = useRef<AbortController | null>(null);

  // Abort controller for the in-flight garment session upload, if any.
  const garmentUploadAbortRef = useRef<AbortController | null>(null);

  // First-run helper: reveal the palette stage, open the picker, and scroll
  // the stage into view. The header occupies a full viewport, so without the
  // scroll the new content is hidden below the fold and the click feels dead.
  const handleStart = () => {
    dispatch({ type: "SHOW_STRIP" });
    setPickerOpen(true);
    setTimeout(() => {
      stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const handleYarnAdd = async (
    file: File,
    label: string,
    source: "sample" | "upload",
    originalSrc?: string,
  ) => {
    const id = crypto.randomUUID();
    const controller = new AbortController();
    extractAbortersRef.current.set(id, controller);

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
      extractAbortersRef.current.delete(id);
    }
  };

  const handleYarnRemove = (id: string) => {
    const controller = extractAbortersRef.current.get(id);
    controller?.abort();
    extractAbortersRef.current.delete(id);

    // Evict and revoke this yarn's cached recolour blob URL, if any.
    const cachedUrl = recolorCacheRef.current.get(id);
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl);
      recolorCacheRef.current.delete(id);
    }

    dispatch({ type: "REMOVE_YARN", id });
  };

  const handleGarmentUpload = async (file: File) => {
    // Cancel any in-flight upload from a previous click before starting.
    garmentUploadAbortRef.current?.abort();
    const controller = new AbortController();
    garmentUploadAbortRef.current = controller;

    const previewUrl = URL.createObjectURL(file);

    try {
      const resized = await resizeImage(file, 800);
      const formData = new FormData();
      formData.append("file", resized);

      const response = await fetch(`${API_BASE_URL}/api/garments/session`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Garment session failed (HTTP ${response.status})`);
      }

      const data = await response.json();

      // Decode the foreground mask before dispatching so paint mode can use
      // it from the moment the session lands. Server is meant to always
      // include this; if it's somehow missing, fall back to an all-foreground
      // mask (paint behaves as if there is no clipping, which is the pre-fix
      // behaviour and matches what the user got before this change).
      const foregroundMask = data.mask_png_b64
        ? await decodeMaskPngBase64(data.mask_png_b64)
        : new Uint8Array(data.width * data.height).fill(255);

      // Compute the garment-wide brightness range from the original image
      // pixels so every paint stroke shares the same normalisation window.
      // Without this, adjacent strokes show seams because each stroke's
      // recolour computes its own range from its own masked pixels.
      const originalRgba = await readGarmentImageRgba(previewUrl, data.width, data.height);
      const brightnessRange = computeGarmentBrightnessRange(
        originalRgba,
        foregroundMask,
        data.width,
        data.height,
      );

      // Wipe the recolour cache from any prior session: each session has
      // its own mask, so cached blobs from the previous garment are stale.
      revokeAllCachedRecolours();

      dispatch({
        type: "SET_GARMENT_SESSION",
        session: {
          sessionId: data.session_id,
          previewUrl,
          width: data.width,
          height: data.height,
          foregroundMask,
          brightnessRange,
        },
      });
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errorMessage =
        err instanceof Error ? err.message : "Failed to upload garment";
      dispatch({ type: "SET_ERROR", error: errorMessage });
    } finally {
      if (garmentUploadAbortRef.current === controller) {
        garmentUploadAbortRef.current = null;
      }
    }
  };

  const handleClearGarment = () => {
    if (state.garmentSession) {
      URL.revokeObjectURL(state.garmentSession.previewUrl);
    }
    revokeAllCachedRecolours();
    recolorAbortRef.current?.abort();
    recolorAbortRef.current = null;
    garmentUploadAbortRef.current?.abort();
    garmentUploadAbortRef.current = null;
    dispatch({ type: "CLEAR_GARMENT" });
  };

  function revokeAllCachedRecolours() {
    for (const url of recolorCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    recolorCacheRef.current.clear();
  }

  // Ctrl+Z (Cmd+Z on macOS) removes the most recently committed region.
  // Minimum-viable undo; full undo/redo with redo lands in Phase 2.F.
  //
  // Detection uses e.code === "KeyZ" first so non-QWERTY layouts work, with
  // e.key as a fallback. We only block the shortcut for text-shaped inputs
  // and contentEditable so the brush-size range slider does not swallow it
  // when focused after a drag.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isModifier = e.ctrlKey || e.metaKey;
      if (!isModifier || e.shiftKey) return;
      const matchesZ = e.code === "KeyZ" || e.key.toLowerCase() === "z";
      if (!matchesZ) return;

      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target?.tagName === "TEXTAREA") return;
      if (target instanceof HTMLInputElement) {
        const textShapedTypes = new Set([
          "text", "search", "email", "password", "url", "tel", "number", "",
        ]);
        if (textShapedTypes.has(target.type)) return;
      }

      e.preventDefault();
      handleUndoLastRegion();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.regions]);

  const handleUndoLastRegion = () => {
    const lastRegion = state.regions[state.regions.length - 1];
    if (!lastRegion) return;
    dispatch({ type: "REMOVE_REGION", id: lastRegion.id });
  };

  // Effect: when the active yarn changes (or a session arrives) and Auto
  // mode is active, fulfill the recolour either from the cache or via the
  // API. In Paint or Select mode the active yarn is a "loaded brush" rather
  // than a whole-garment selector; switching yarns there should not retrigger
  // the auto recolour.
  useEffect(() => {
    if (state.activeMode !== "auto") return;
    const session = state.garmentSession;
    const yarnId = state.activeYarnId;
    if (!session || !yarnId) return;

    const yarn = state.yarns.find((y) => y.id === yarnId);
    if (!yarn || yarn.status !== "ready" || yarn.palette.length === 0) return;

    // Cache hit: short-circuit straight to the slider.
    const cached = recolorCacheRef.current.get(yarnId);
    if (cached) {
      dispatch({ type: "RECOLOR_SUCCESS", url: cached });
      return;
    }

    // Cancel any in-flight recolour from a prior yarn switch before starting
    // a new one. The user clicked something newer; abandon the older request.
    recolorAbortRef.current?.abort();
    const controller = new AbortController();
    recolorAbortRef.current = controller;

    const run = async () => {
      dispatch({ type: "START_RECOLOR" });
      try {
        const formData = new FormData();
        formData.append("session_id", session.sessionId);
        formData.append("colors", JSON.stringify(yarn.palette));
        if (yarn.percentages.length > 0) {
          formData.append("percentages", JSON.stringify(yarn.percentages));
        }

        const response = await fetch(`${API_BASE_URL}/api/garments/recolor`, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Recolour failed (HTTP ${response.status})`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        recolorCacheRef.current.set(yarnId, url);
        dispatch({ type: "RECOLOR_SUCCESS", url });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const errorMessage =
          err instanceof Error ? err.message : "Failed to recolour garment";
        dispatch({ type: "RECOLOR_ERROR", error: errorMessage });
      }
    };

    run();
    // We intentionally depend on yarn id, session id, and mode. Adding
    // new yarns or editing other yarns should NOT re-fire the recolour
    // for the active yarn. We DO want to re-fire when the user switches
    // back to Auto from Paint, so activeMode is included.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeYarnId, state.garmentSession?.sessionId, state.activeMode]);

  return (
    <>
      <a href="#main-content" className="sr-only focus-visible-only">
        Skip to main content
      </a>
      <PetalBackground />
      <Header onStart={handleStart} />
      {state.showSampleStrip && (
        <main id="main-content" className="palette-stage" ref={stageRef}>
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
          <div className="garment-row">
            <ModeToolbar
              activeMode={state.activeMode}
              onChange={(mode) => dispatch({ type: "SET_MODE", mode })}
              visible={state.garmentSession !== null}
            />
            <GarmentStage
              session={state.garmentSession}
              isRecoloring={state.isRecoloring}
              currentRecolorUrl={state.currentRecolorUrl}
              error={state.error}
              onUpload={handleGarmentUpload}
              onClear={handleClearGarment}
              activeMode={state.activeMode}
              activeYarn={
                state.yarns.find((y) => y.id === state.activeYarnId) ?? null
              }
              yarns={state.yarns}
              regions={state.regions}
              onCommitRegion={(region) =>
                dispatch({ type: "COMMIT_REGION", region })
              }
              onUndoLastRegion={handleUndoLastRegion}
            />
          </div>
        </main>
      )}
      <ReportIssue />
    </>
  );
}

export default App;
