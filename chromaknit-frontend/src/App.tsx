import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "./config";
import { useAppState, type GarmentSession, type Yarn } from "./hooks/useAppState";
import { computeGarmentBrightnessRange, recolourLocal } from "./lib/recolourLocal";
import "./App.css";

import Masthead from "./components/Masthead";
import Hero from "./components/Hero";
import YarnPalette from "./components/YarnPalette";
import YarnPicker from "./components/YarnPicker";
import GarmentStage from "./components/GarmentStage";
import ModeToolbar from "./components/ModeToolbar";
import ReportIssue from "./components/ReportIssue";

// Mirror of scripts/precompute_samples.py:slugify. Used to build the path to
// the precomputed JSON / mask for a sample yarn or garment.
function slugify(label: string): string {
  return label.toLowerCase().replace(/ /g, "-");
}

// Sentinel prefix marking a GarmentSession that lives entirely client-side.
// The auto-recolour effect detects this and runs the HSV remap locally
// instead of POSTing to /api/garments/recolor (cost discipline: sample flows
// must not hit the backend).
const STATIC_SESSION_PREFIX = "static-";

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

// Decode a single-channel grayscale PNG (the browser surfaces it with
// R = G = B) into a 1-channel Uint8Array by reading the red channel of an
// off-screen canvas. Shared between the base64 path (server response) and
// the URL path (precomputed static asset).
async function decodeMaskPngFromImageSrc(src: string): Promise<Uint8Array> {
  const img = new Image();
  img.src = src;
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

function decodeMaskPngBase64(base64: string): Promise<Uint8Array> {
  return decodeMaskPngFromImageSrc(`data:image/png;base64,${base64}`);
}

function decodeMaskPngFromUrl(url: string): Promise<Uint8Array> {
  return decodeMaskPngFromImageSrc(url);
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

// Recolour the garment entirely client-side. Reads the original sample
// image, runs the JS port of the HSV pipeline against the precomputed
// foreground mask, and returns a blob URL of the result. Used by the
// sample/static path (sentinel session id starting with "static-") so the
// demo flow stays free regardless of backend availability.
//
// Validated against the Python reference via the parity test in
// chromaknit-frontend/src/lib/recolourLocal.parity.test.ts.
async function runClientSideRecolour(
  session: GarmentSession,
  yarn: Yarn,
): Promise<string> {
  const rgba = await readGarmentImageRgba(
    session.previewUrl,
    session.width,
    session.height,
  );
  recolourLocal(
    rgba,
    session.foregroundMask,
    session.width,
    session.height,
    yarn.palette,
    yarn.percentages.length === yarn.palette.length ? yarn.percentages : null,
    session.brightnessRange,
  );
  const canvas = document.createElement("canvas");
  canvas.width = session.width;
  canvas.height = session.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context for recolour output");
  // TypeScript 5.7+ tightened typed-array generics: getImageData().data returns
  // Uint8ClampedArray<ArrayBufferLike> but new ImageData() wants the narrower
  // Uint8ClampedArray<ArrayBuffer>. Runtime is identical (no SharedArrayBuffer
  // path here), so a cast is safe and avoids a wasted buffer copy.
  const imageData = new ImageData(
    rgba as Uint8ClampedArray<ArrayBuffer>,
    session.width,
    session.height,
  );
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not encode recolour as PNG");
  return URL.createObjectURL(blob);
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

  const handleHome = () => {
    setPickerOpen(false);
    dispatch({ type: "HIDE_STRIP" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Upload path: user-supplied yarn file. Hits /api/colors/extract because
  // the palette is unique to this image. Cost is bounded by upload size and
  // by Phase C rate limits.
  const handleYarnUpload = async (file: File, label: string) => {
    const id = crypto.randomUUID();
    const controller = new AbortController();
    extractAbortersRef.current.set(id, controller);

    try {
      const resized = await resizeImage(file, 400);
      const previewUrl = await fileToDataUrl(resized);

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

  // Sample path: load the precomputed palette JSON shipped under
  // /samples/precomputed/yarns/. No backend call. The JSON is generated by
  // scripts/precompute_samples.py and committed alongside the sample image.
  // If the JSON is missing (e.g. a new sample was added without re-running
  // the script), the yarn surfaces an error rather than silently falling
  // back to the API: a fallback would defeat the cost-protection guarantee.
  const handleYarnSampleSelect = async (label: string, src: string) => {
    // Same sample already in the palette? Treat the click as a re-select
    // rather than a duplicate add. Sample previewUrls are stable static
    // paths (e.g. /samples/yarn-mint.jpg), so they're a reliable identity
    // key for samples. Uploaded yarns use unique data URLs, so this never
    // collides with an upload.
    const existing = state.yarns.find((y) => y.previewUrl === src);
    if (existing) {
      dispatch({ type: "SET_ACTIVE_YARN", id: existing.id });
      return;
    }

    const id = crypto.randomUUID();
    dispatch({ type: "ADD_YARN_PENDING", id, label, previewUrl: src });

    try {
      const slug = slugify(label);
      const response = await fetch(`/samples/precomputed/yarns/${slug}.json`);
      if (!response.ok) {
        throw new Error(`Sample palette not found (HTTP ${response.status})`);
      }
      const data = await response.json();
      dispatch({
        type: "ADD_YARN_SUCCESS",
        id,
        palette: data.palette,
        percentages: data.percentages || [],
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load sample yarn";
      dispatch({ type: "ADD_YARN_ERROR", id, errorMessage });
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

  // Sample path: load the precomputed garment metadata + foreground mask
  // shipped under /samples/precomputed/garments/. Builds a sentinel session
  // (sessionId starts with "static-") so the auto-recolour effect knows to
  // run client-side. No backend call.
  const handleGarmentSampleSelect = async (label: string, src: string) => {
    // Cancel any in-flight upload or sample load. Reuses the upload abort ref
    // because both paths produce the same kind of state transition (a new
    // session) and a newer click should win over an older in-flight load.
    garmentUploadAbortRef.current?.abort();
    const controller = new AbortController();
    garmentUploadAbortRef.current = controller;

    try {
      const slug = slugify(label);
      const metaResponse = await fetch(
        `/samples/precomputed/garments/${slug}.json`,
        { signal: controller.signal },
      );
      if (!metaResponse.ok) {
        throw new Error(`Sample garment not found (HTTP ${metaResponse.status})`);
      }
      const data = await metaResponse.json();

      const foregroundMask = await decodeMaskPngFromUrl(data.maskPath);
      if (controller.signal.aborted) return;

      // A new session invalidates the per-yarn recolour cache (the cached
      // blobs were rendered against the previous garment's mask).
      revokeAllCachedRecolours();

      dispatch({
        type: "SET_GARMENT_SESSION",
        session: {
          sessionId: `${STATIC_SESSION_PREFIX}${slug}`,
          previewUrl: src,
          width: data.width,
          height: data.height,
          foregroundMask,
          brightnessRange: data.brightnessRange,
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load sample garment";
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
    // The same controller doubles as a cancellation token for the static
    // path (which has no fetch to abort but still needs to skip its dispatch
    // if a newer recolour has started while it was running).
    recolorAbortRef.current?.abort();
    const controller = new AbortController();
    recolorAbortRef.current = controller;

    // Static session: run the JS port of the HSV pipeline locally instead of
    // POSTing to /api/garments/recolor. Cost-discipline guarantee: clicking
    // through every sample yarn against a sample garment must never hit the
    // backend.
    if (session.sessionId.startsWith(STATIC_SESSION_PREFIX)) {
      const run = async () => {
        dispatch({ type: "START_RECOLOR" });
        try {
          const url = await runClientSideRecolour(session, yarn);
          if (controller.signal.aborted) {
            URL.revokeObjectURL(url);
            return;
          }
          recolorCacheRef.current.set(yarnId, url);
          dispatch({ type: "RECOLOR_SUCCESS", url });
        } catch (err) {
          if (controller.signal.aborted) return;
          const errorMessage =
            err instanceof Error ? err.message : "Failed to recolour garment";
          dispatch({ type: "RECOLOR_ERROR", error: errorMessage });
        }
      };
      run();
      return;
    }

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
      <Masthead onStart={handleStart} onHome={handleHome} />
      {state.showSampleStrip ? (
        <main id="main-content" className="stage-section" ref={stageRef}>
          {pickerOpen && (
            <YarnPicker
              onYarnUpload={handleYarnUpload}
              onYarnSampleSelect={handleYarnSampleSelect}
              onClose={() => setPickerOpen(false)}
            />
          )}
          <div className="stage-container">
            <div className="stage-grid">
              <div className="stage-main">
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
                  onSampleSelect={handleGarmentSampleSelect}
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
              <aside className="stage-side" aria-label="Palette and save actions">
                <YarnPalette
                  yarns={state.yarns}
                  activeYarnId={state.activeYarnId}
                  onSelect={(id) => dispatch({ type: "SET_ACTIVE_YARN", id })}
                  onRemove={handleYarnRemove}
                  onAdd={() => setPickerOpen(true)}
                />
                {state.garmentSession && (
                  <div className="side-block">
                    <div className="side-block-label">
                      <span className="caps">Keep the revision</span>
                    </div>
                    <div className="side-actions">
                      {state.currentRecolorUrl && (
                        <a
                          className="side-action"
                          href={state.currentRecolorUrl}
                          download="chromaknit-recoloured.png"
                        >
                          Download
                        </a>
                      )}
                      <button
                        type="button"
                        className="side-action side-action--secondary"
                        onClick={handleClearGarment}
                      >
                        Change garment
                      </button>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </main>
      ) : (
        <Hero onStart={handleStart} />
      )}
      <ReportIssue />
    </>
  );
}

export default App;
