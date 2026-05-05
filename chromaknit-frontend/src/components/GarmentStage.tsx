import { useEffect, useRef, useState } from "react";
import type { GarmentSession, Mode, Region, Yarn } from "../hooks/useAppState";
import { recolourLocal, stampCircle, stampLine } from "../lib/recolourLocal";
import "./GarmentStage.css";

// Brush radius bounds (canvas pixels). The slider in the UI maps to this
// range. Default sits in the middle, suitable for most flat-lay garments.
const BRUSH_MIN = 4;
const BRUSH_MAX = 60;
const BRUSH_DEFAULT = 18;

// Decode a base64-encoded PNG mask back to a 1-channel Uint8Array (R channel).
async function decodeMaskPng(base64: string): Promise<Uint8Array> {
  const img = new Image();
  img.src = `data:image/png;base64,${base64}`;
  await img.decode();
  const off = document.createElement("canvas");
  off.width = img.width;
  off.height = img.height;
  const offCtx = off.getContext("2d");
  if (!offCtx) throw new Error("Could not get 2D context for mask decode");
  offCtx.drawImage(img, 0, 0);
  const data = offCtx.getImageData(0, 0, img.width, img.height).data;
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4]; // R channel
  return out;
}

// Encode a 1-channel mask as base64 PNG bytes (without the data: prefix).
async function encodeMaskAsBase64Png(
  mask: Uint8Array,
  width: number,
  height: number,
): Promise<string> {
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const ctx = off.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context for mask encode");
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < mask.length; i++) {
    const px = i * 4;
    const v = mask[i];
    imageData.data[px] = v;
    imageData.data[px + 1] = v;
    imageData.data[px + 2] = v;
    imageData.data[px + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    off.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not encode mask as PNG");
  const buffer = await blob.arrayBuffer();
  // Convert ArrayBuffer to base64. btoa handles binary strings.
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

interface GarmentSample {
  src: string;
  label: string;
}

const GARMENT_SAMPLES: GarmentSample[] = [
  { src: "/samples/garment-cardigan.jpg", label: "cardigan" },
  { src: "/samples/garment-green-beanie.jpg", label: "beanie" },
  { src: "/samples/garment-red-socks.jpg", label: "socks" },
  { src: "/samples/garment-black-blanket.jpg", label: "blanket" },
  { src: "/samples/garment-baby.jpg", label: "baby knit" },
];

interface GarmentStageProps {
  session: GarmentSession | null;
  isRecoloring: boolean;
  currentRecolorUrl: string | null;
  error: string | null;
  // Returns a promise so the stage can show its own loading state on the
  // upload button while the parent's handler is in flight (rembg can take a
  // couple of seconds, so visible feedback matters).
  onUpload: (file: File) => Promise<void> | void;
  // Sample path: the parent loads precomputed mask + metadata from
  // /samples/precomputed/garments/. Fast (no rembg), but still async, so the
  // tile shows its spinner while in flight.
  onSampleSelect: (label: string, src: string) => Promise<void> | void;
  onClear: () => void;
  // Phase 2 paint mode plumbing.
  activeMode: Mode;
  activeYarn: Yarn | null;
  // All yarns, so the canvas can look up each region's yarn by id when
  // compositing the persisted regions on top of the base.
  yarns: Yarn[];
  regions: Region[];
  onCommitRegion: (region: Region) => void;
  // Undo affordance. Removes the most recently committed region. Mirrors
  // the Ctrl+Z keyboard shortcut wired in App.tsx.
  onUndoLastRegion: () => void;
}

/**
 * Garment area beneath the yarn palette.
 *
 * No session yet: shows an upload zone (drag-and-drop or click to pick).
 * Session in flight: shows the original alongside the in-progress recolour.
 * Session with a result: shows a before/after slider with a download link.
 *
 * Picking a yarn in the parent palette is what triggers recolour. This
 * component is purely a view onto state.garmentSession + state.currentRecolorUrl.
 */
function GarmentStage({
  session,
  isRecoloring,
  currentRecolorUrl,
  error,
  onUpload,
  onSampleSelect,
  onClear,
  activeMode,
  activeYarn,
  yarns,
  regions,
  onCommitRegion,
  onUndoLastRegion,
}: GarmentStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Paint brush radius in canvas pixels. Slider visible only when paint
  // mode is active; persists across mode switches in the same session.
  const [brushRadius, setBrushRadius] = useState(BRUSH_DEFAULT);
  // Cached decoded base image (whichever URL we're showing right now). We
  // hold onto the HTMLImageElement so the paint redraw can blit it
  // synchronously instead of re-decoding the URL per stroke move.
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  // Decoded foreground masks for each persisted region, keyed by region id.
  // Populated lazily from region.maskPngBase64 in the regions effect.
  const regionMasksRef = useRef<Map<string, Uint8Array>>(new Map());
  // The mask currently being painted by an active stroke, plus tracking refs
  // for the pointer-down state and last stamped point.
  const strokeMaskRef = useRef<Uint8Array | null>(null);
  const isStrokingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // strokeTick bumps on every pointermove to force a re-render so the draw
  // effect runs. Mutating refs alone wouldn't trigger React.
  const [strokeTick, setStrokeTick] = useState(0);
  // Tracks which sample is currently uploading so we can show a per-tile
  // spinner. The whole sample grid disables while one is in flight to
  // prevent confused multi-click states.
  const [uploadingSampleLabel, setUploadingSampleLabel] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLocalError("That file is not an image. Pick a JPG or PNG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setLocalError(`That image is ${mb}MB. The upload limit is 5MB. Try resizing first.`);
      return;
    }
    setLocalError(null);
    setIsUploadingFile(true);
    try {
      await onUpload(file);
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleSampleClick = async (sample: GarmentSample) => {
    setUploadingSampleLabel(sample.label);
    try {
      // Hand off to the parent's static-asset path. The parent reads the
      // precomputed JSON + mask under /samples/precomputed/garments/ and
      // dispatches a sentinel session that the auto-recolour effect handles
      // entirely client-side.
      await onSampleSelect(sample.label, sample.src);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Could not load that sample.";
      setLocalError(errorMessage);
    } finally {
      setUploadingSampleLabel(null);
    }
  };

  const anyUploadInFlight = isUploadingFile || uploadingSampleLabel !== null;

  // Decode region masks lazily as new regions arrive. We cache decoded
  // Uint8Array masks so paint redraws don't re-parse base64 every frame.
  useEffect(() => {
    let cancelled = false;
    const cache = regionMasksRef.current;
    // Drop cached masks for regions that no longer exist.
    const currentIds = new Set(regions.map((r) => r.id));
    for (const id of cache.keys()) {
      if (!currentIds.has(id)) cache.delete(id);
    }

    const decode = async () => {
      for (const region of regions) {
        if (cache.has(region.id)) continue;
        const mask = await decodeMaskPng(region.maskPngBase64);
        if (cancelled) return;
        cache.set(region.id, mask);
      }
      // Trigger a redraw once any new mask lands.
      setStrokeTick((t) => t + 1);
    };
    decode();
    return () => {
      cancelled = true;
    };
  }, [regions]);

  // Composite the canvas: base image, then each persisted region recoloured,
  // then the active paint stroke (if any). Runs whenever an input changes.
  useEffect(() => {
    if (!session) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Paint mode always composites against the ORIGINAL garment, never
    // against an Auto-mode recolour. Two reasons:
    //   1. UX: Paint should show "the original garment with my brush
    //      strokes on it", not "the auto-recoloured garment with my
    //      strokes on top". Otherwise switching Auto -> Paint shows the
    //      auto-recolour bleeding through.
    //   2. Math: recolourLocal reads V from whatever's underneath. If the
    //      underneath is an Auto-recoloured garment, the V values are
    //      from that recolour, not from the original — so a stroke on
    //      top of a white auto-recolour gets mapped to the lightest
    //      colour of its target palette (often near-white) and
    //      effectively disappears.
    const useOriginal =
      showOriginal || activeMode === "paint" || !currentRecolorUrl;
    const targetUrl = useOriginal ? session.previewUrl : currentRecolorUrl;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      baseImageRef.current = img;
      drawComposite();
    };
    img.src = targetUrl;
    return () => {
      cancelled = true;
    };
    // drawComposite is referenced lexically; we want to redraw on these inputs
    // changing. The function itself reads refs that hold the latest stroke.
    // activeMode is included because the targetUrl computation depends on it
    // (Paint mode always uses the original; Auto uses currentRecolorUrl).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, currentRecolorUrl, showOriginal, activeMode]);

  // Re-composite (without re-loading the base image) when regions or the
  // stroke tick change. The base image is already cached in baseImageRef.
  // activeMode is included so Paint -> Auto and Auto -> Paint redraw the
  // overlay correctly: Auto hides regions, Paint shows them. The first
  // effect also reloads the base image when activeMode changes (Paint uses
  // the original; Auto uses currentRecolorUrl), which calls drawComposite
  // via img.onload — so this dep is technically redundant but defends
  // against a future refactor that might decouple the two effects.
  useEffect(() => {
    drawComposite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, strokeTick, activeMode]);

  function drawComposite() {
    const canvas = canvasRef.current;
    const baseImg = baseImageRef.current;
    if (!canvas || !baseImg) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

    // "Hold to see original" reveals the unmodified upload. Skip persisted
    // regions and the in-flight stroke so the user sees the true source
    // photo, not the source plus paint composited.
    if (showOriginal) return;

    // Regions and the active stroke only render in Paint mode. In Auto mode
    // the canvas shows the whole-garment recolour from currentRecolorUrl
    // unmodified — overlaying regions on top would mix two semantically
    // different views (whole-garment Auto + per-region Paint) and confuse
    // the user. Regions stay in state.regions across mode switches; they're
    // just hidden in Auto mode and re-shown when Paint comes back.
    if (activeMode !== "paint") return;

    // We're going to apply HSV remaps in-place on a single ImageData buffer.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let dirty = false;

    // The garment-wide brightness range was computed once when the session
    // loaded. Pass it to every recolourLocal call so adjacent strokes share
    // the same shadow-to-highlight normalisation and don't show seams.
    const range = session?.brightnessRange ?? null;

    // Persisted regions, in commit order. Each region carries the yarn id it
    // was painted with; we look that yarn up in the full yarns prop. If the
    // yarn was removed since (or its extraction never finished), skip.
    const yarnsById = new Map(yarns.map((y) => [y.id, y]));
    for (const region of regions) {
      const mask = regionMasksRef.current.get(region.id);
      if (!mask) continue;
      const yarn = yarnsById.get(region.yarnId);
      if (!yarn || yarn.status !== "ready" || yarn.palette.length === 0) continue;
      recolourLocal(
        imageData.data,
        mask,
        canvas.width,
        canvas.height,
        yarn.palette,
        yarn.percentages.length === yarn.palette.length ? yarn.percentages : null,
        range,
      );
      dirty = true;
    }

    // Active in-flight stroke.
    const stroke = strokeMaskRef.current;
    if (stroke && activeYarn && activeYarn.palette.length > 0) {
      recolourLocal(
        imageData.data,
        stroke,
        canvas.width,
        canvas.height,
        activeYarn.palette,
        activeYarn.percentages.length === activeYarn.palette.length
          ? activeYarn.percentages
          : null,
        range,
      );
      dirty = true;
    }

    if (dirty) ctx.putImageData(imageData, 0, 0);
  }

  // === Paint mode pointer handlers ===
  const paintEnabled =
    activeMode === "paint" && session !== null && activeYarn !== null && activeYarn.status === "ready";

  function pointerToCanvas(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!paintEnabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = pointerToCanvas(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    strokeMaskRef.current = new Uint8Array(canvas.width * canvas.height);
    isStrokingRef.current = true;
    lastPointRef.current = pt;
    stampCircle(
      strokeMaskRef.current,
      canvas.width,
      canvas.height,
      pt.x,
      pt.y,
      brushRadius,
      session?.foregroundMask,
    );
    setStrokeTick((t) => t + 1);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!paintEnabled || !isStrokingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas || !strokeMaskRef.current || !lastPointRef.current) return;
    const pt = pointerToCanvas(e.clientX, e.clientY);
    if (!pt) return;
    stampLine(
      strokeMaskRef.current,
      canvas.width,
      canvas.height,
      lastPointRef.current.x,
      lastPointRef.current.y,
      pt.x,
      pt.y,
      brushRadius,
      session?.foregroundMask,
    );
    lastPointRef.current = pt;
    setStrokeTick((t) => t + 1);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!paintEnabled || !isStrokingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas || !strokeMaskRef.current || !activeYarn) return;
    canvas.releasePointerCapture(e.pointerId);
    isStrokingRef.current = false;
    lastPointRef.current = null;

    // Capture the mask + region id synchronously. We need stable references
    // for two reasons:
    //   1. To pre-populate the decoded-mask cache below (so drawComposite
    //      can render the new region the instant COMMIT_REGION lands,
    //      without waiting for the async base64 decode in the regions
    //      effect to round-trip).
    //   2. To identity-check before clearing strokeMaskRef in the .then()
    //      callback. The user may have already started a new stroke by the
    //      time encoding finishes; nulling strokeMaskRef unconditionally
    //      would clobber the new stroke's buffer and silently lose its
    //      pointermove stamps.
    const strokeMask = strokeMaskRef.current;
    const newRegionId = crypto.randomUUID();

    // Pre-cache so drawComposite has the mask without waiting for the
    // regions effect's base64 -> Uint8Array decode round-trip. Without
    // this, between COMMIT_REGION and decode-complete there's a frame
    // where neither the active stroke nor the persisted region is drawn,
    // and the user sees the stroke flash off and back on.
    regionMasksRef.current.set(newRegionId, strokeMask);

    encodeMaskAsBase64Png(strokeMask, canvas.width, canvas.height)
      .then((maskPngBase64) => {
        onCommitRegion({
          id: newRegionId,
          yarnId: activeYarn.id,
          source: "paint",
          maskPngBase64,
          createdAt: Date.now(),
        });
        // Only clear if the stroke ref still points to the mask we just
        // encoded. A new pointerDown may have replaced it with a fresh
        // buffer mid-encode; nulling that would lose the in-flight stroke.
        if (strokeMaskRef.current === strokeMask) {
          strokeMaskRef.current = null;
        }
        setStrokeTick((t) => t + 1);
      })
      .catch((err) => {
        // Encoding shouldn't fail under normal circumstances. If it does,
        // surface as a local error so the user knows the stroke was lost,
        // and clean up the cache entry that won't have a region to belong to.
        regionMasksRef.current.delete(newRegionId);
        setLocalError(
          err instanceof Error ? err.message : "Could not save the paint stroke.",
        );
        if (strokeMaskRef.current === strokeMask) {
          strokeMaskRef.current = null;
        }
        setStrokeTick((t) => t + 1);
      });
  }

  if (!session) {
    return (
      <section className="garment-stage" aria-label="Garment workspace">
        <div className="garment-empty-card">
          <button
            type="button"
            className={`garment-upload-tile${isUploadingFile ? " garment-upload-tile--loading" : ""}`}
            onClick={() => inputRef.current?.click()}
            aria-label="Upload a garment image"
            disabled={anyUploadInFlight}
          >
            {isUploadingFile ? (
              <>
                <span className="garment-upload-spinner" aria-hidden="true" />
                <span className="garment-upload-title">uploading...</span>
              </>
            ) : (
              <>
                <span className="garment-upload-plus" aria-hidden="true">+</span>
                <span className="garment-upload-title">upload a garment</span>
                <span className="garment-upload-hint">flat-lay or worn, jpg or png, up to 5MB</span>
              </>
            )}
          </button>
          <p className="garment-samples-label">or try a sample</p>
          <div
            className="garment-samples-grid"
            role="group"
            aria-label="Garment samples"
          >
            {GARMENT_SAMPLES.map((sample) => {
              const isThisLoading = uploadingSampleLabel === sample.label;
              return (
                <button
                  key={sample.label}
                  type="button"
                  className={`garment-sample-card${isThisLoading ? " garment-sample-card--loading" : ""}`}
                  onClick={() => handleSampleClick(sample)}
                  aria-label={`Use ${sample.label} sample`}
                  disabled={anyUploadInFlight}
                >
                  <img src={sample.src} alt="" />
                  <span className="garment-sample-label">{sample.label}</span>
                  {isThisLoading && (
                    <span className="garment-sample-spinner" role="status" aria-label="Uploading" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          aria-label="Upload a garment image"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        {(localError || error) && (
          <p className="garment-stage-error" role="alert">{localError || error}</p>
        )}
      </section>
    );
  }

  // Session present. Render onto a real <canvas> so paint mode (Phase 2.D)
  // has a writeable surface. The canvas always shows either the original or
  // the recoloured composite based on showOriginal; the toggle replaces the
  // before/after slider that lived here in slice 1.C.
  return (
    <section className="garment-stage" aria-label="Garment workspace">
      <div className="garment-card">
        <div className="garment-canvas-wrap">
          <canvas
            ref={canvasRef}
            className={`garment-canvas${paintEnabled ? " garment-canvas--paint" : ""}`}
            width={session.width}
            height={session.height}
            aria-label={
              showOriginal
                ? "Original garment"
                : currentRecolorUrl
                  ? "Recoloured garment"
                  : "Garment"
            }
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {isRecoloring && (
            <div className="garment-recoloring-overlay" role="status">
              <span className="garment-recoloring-spinner" aria-hidden="true" />
              <span>recolouring...</span>
            </div>
          )}
        </div>
        {paintEnabled && (
          <div className="garment-brush" role="group" aria-label="Brush controls">
            <label className="garment-brush-label">
              <span>brush size</span>
              <input
                type="range"
                min={BRUSH_MIN}
                max={BRUSH_MAX}
                value={brushRadius}
                onChange={(e) => setBrushRadius(Number(e.target.value))}
                aria-valuemin={BRUSH_MIN}
                aria-valuemax={BRUSH_MAX}
                aria-valuenow={brushRadius}
              />
              <span
                className="garment-brush-preview"
                style={{
                  width: brushRadius * 2,
                  height: brushRadius * 2,
                  background: activeYarn?.palette[0] ?? "rgba(138, 104, 112, 0.5)",
                }}
                aria-hidden="true"
              />
            </label>
            <button
              type="button"
              className="garment-brush-undo"
              onClick={onUndoLastRegion}
              disabled={regions.length === 0}
              title="Remove last paint stroke (Ctrl+Z)"
            >
              undo
            </button>
          </div>
        )}
        {(currentRecolorUrl || regions.length > 0) && (
          <button
            type="button"
            className="garment-toggle"
            onMouseDown={() => setShowOriginal(true)}
            onMouseUp={() => setShowOriginal(false)}
            onMouseLeave={() => setShowOriginal(false)}
            onTouchStart={() => setShowOriginal(true)}
            onTouchEnd={() => setShowOriginal(false)}
            aria-pressed={showOriginal}
          >
            {showOriginal ? "showing original" : "hold to see original"}
          </button>
        )}
        <div className="garment-actions">
          {currentRecolorUrl && (
            <a
              href={currentRecolorUrl}
              download="chromaknit-recoloured.png"
              className="garment-action-link"
            >
              download
            </a>
          )}
          <button
            type="button"
            className="garment-action-link garment-action-link--secondary"
            onClick={onClear}
          >
            change garment
          </button>
        </div>
        {error && (
          <p className="garment-stage-error" role="alert">{error}</p>
        )}
      </div>
    </section>
  );
}

export default GarmentStage;
