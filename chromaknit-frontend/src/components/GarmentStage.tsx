import { useEffect, useRef, useState } from "react";
import type { GarmentSession, Mode, Region, Yarn } from "../hooks/useAppState";
import { recolourLocal, stampCircle, stampLine } from "../lib/recolourLocal";
import "./GarmentStage.css";

// Continuous brush radius in display (CSS) pixels so the visible brush size
// stays constant across photos with different intrinsic resolutions. The
// stamp call sites convert to bitmap pixels via brushRadiusInCanvasPixels()
// using the same object-fit: contain scale that pointerToCanvas applies.
const BRUSH_MIN = 4;
const BRUSH_MAX = 60;
const BRUSH_STEP = 2;
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
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
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
  onUpload: (file: File) => Promise<void> | void;
  onSampleSelect: (label: string, src: string) => Promise<void> | void;
  activeMode: Mode;
  activeYarn: Yarn | null;
  yarns: Yarn[];
  regions: Region[];
  onCommitRegion: (region: Region) => void;
  onUndoLastRegion: () => void;
}

function GarmentStage({
  session,
  isRecoloring,
  currentRecolorUrl,
  error,
  onUpload,
  onSampleSelect,
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
  const [brushRadius, setBrushRadius] = useState(BRUSH_DEFAULT);

  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const regionMasksRef = useRef<Map<string, Uint8Array>>(new Map());
  const strokeMaskRef = useRef<Uint8Array | null>(null);
  const isStrokingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [strokeTick, setStrokeTick] = useState(0);

  const [uploadingSampleLabel, setUploadingSampleLabel] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  // Cold-start signal: the HuggingFace Spaces backend sleeps when idle and
  // takes ~30-60 seconds to wake on first request. If the upload is still in
  // flight after 5 seconds we swap the copy so the user knows it isn't broken.
  const [isWarming, setIsWarming] = useState(false);
  const warmingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (warmingTimerRef.current !== null) {
        window.clearTimeout(warmingTimerRef.current);
        warmingTimerRef.current = null;
      }
    };
  }, []);

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
    warmingTimerRef.current = window.setTimeout(() => {
      setIsWarming(true);
    }, 5000);
    try {
      await onUpload(file);
    } finally {
      if (warmingTimerRef.current !== null) {
        window.clearTimeout(warmingTimerRef.current);
        warmingTimerRef.current = null;
      }
      setIsWarming(false);
      setIsUploadingFile(false);
    }
  };

  const handleSampleClick = async (sample: GarmentSample) => {
    setUploadingSampleLabel(sample.label);
    try {
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
      setStrokeTick((t) => t + 1);
    };
    decode();
    return () => {
      cancelled = true;
    };
  }, [regions]);

  // Composite the canvas: base image, then each persisted region recoloured,
  // then the active paint stroke (if any).
  useEffect(() => {
    if (!session) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Paint mode always composites against the ORIGINAL garment, never
    // against an Auto-mode recolour. See note in previous version.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, currentRecolorUrl, showOriginal, activeMode]);

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

    if (showOriginal) return;
    if (activeMode !== "paint") return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let dirty = false;
    const range = session?.brightnessRange ?? null;

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

  const paintEnabled =
    activeMode === "paint" && session !== null && activeYarn !== null && activeYarn.status === "ready";

  // Returns the rendered photo rectangle inside the canvas's CSS box plus
  // the bitmap-to-display scale. The canvas uses `object-fit: contain` so
  // whenever the bitmap aspect ratio differs from the CSS box's, the photo
  // is letterboxed. Anything that maps pointer position or brush radius
  // between display and bitmap space must account for this.
  function getCanvasRenderInfo(): {
    rect: DOMRect;
    padX: number;
    padY: number;
    renderedWidth: number;
    renderedHeight: number;
    scale: number;
  } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const canvasAspect = canvas.width / canvas.height;
    const rectAspect = rect.width / rect.height;
    let renderedWidth: number;
    let renderedHeight: number;
    let padX: number;
    let padY: number;
    if (canvasAspect > rectAspect) {
      renderedWidth = rect.width;
      renderedHeight = rect.width / canvasAspect;
      padX = 0;
      padY = (rect.height - renderedHeight) / 2;
    } else {
      renderedHeight = rect.height;
      renderedWidth = rect.height * canvasAspect;
      padX = (rect.width - renderedWidth) / 2;
      padY = 0;
    }
    // Bitmap pixels per CSS pixel. Both axes use the same scale because
    // object-fit: contain preserves aspect ratio.
    const scale = canvas.width / renderedWidth;
    return { rect, padX, padY, renderedWidth, renderedHeight, scale };
  }

  function pointerToCanvas(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const info = getCanvasRenderInfo();
    if (!info) return null;
    const { rect, padX, padY, renderedWidth, renderedHeight } = info;

    const x = ((clientX - rect.left - padX) / renderedWidth) * canvas.width;
    const y = ((clientY - rect.top - padY) / renderedHeight) * canvas.height;

    // Reject points inside the letterbox bars: stroking there would write
    // to indices outside the visible image (which the stamp would clamp,
    // but the user expectation is that clicks on cream do nothing).
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return null;
    return { x, y };
  }

  // The slider's brushRadius is in display (CSS) pixels so the visible brush
  // size feels the same regardless of the photo's intrinsic resolution. Stamps
  // need bitmap pixels, so multiply by the same display-to-bitmap scale that
  // pointerToCanvas uses.
  function brushRadiusInCanvasPixels(): number {
    const info = getCanvasRenderInfo();
    if (!info) return brushRadius;
    return brushRadius * info.scale;
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
    const radius = brushRadiusInCanvasPixels();
    stampCircle(
      strokeMaskRef.current,
      canvas.width,
      canvas.height,
      pt.x,
      pt.y,
      radius,
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
    const radius = brushRadiusInCanvasPixels();
    stampLine(
      strokeMaskRef.current,
      canvas.width,
      canvas.height,
      lastPointRef.current.x,
      lastPointRef.current.y,
      pt.x,
      pt.y,
      radius,
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

    const strokeMask = strokeMaskRef.current;
    const newRegionId = crypto.randomUUID();
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
        if (strokeMaskRef.current === strokeMask) {
          strokeMaskRef.current = null;
        }
        setStrokeTick((t) => t + 1);
      })
      .catch((err) => {
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

  // ============== Empty state ==============
  if (!session) {
    return (
      <article className="garment-card garment-card--empty" aria-label="Garment workspace">
        <div className="garment-fig-meta">
          <span className="caps">Awaiting garment</span>
          <span className="italic">no photograph yet</span>
        </div>

        <div
          className={`upload-zone garment-upload${anyUploadInFlight ? " garment-upload--loading" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => !anyUploadInFlight && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (anyUploadInFlight) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          aria-disabled={anyUploadInFlight}
        >
          {anyUploadInFlight ? (
            <>
              <span className="garment-upload-spinner" aria-hidden="true" />
              <h5>
                {isUploadingFile
                  ? (isWarming ? "Stretching its legs" : "Reading the photograph")
                  : `Loading the ${uploadingSampleLabel}`}
              </h5>
              <p>
                {isUploadingFile && isWarming
                  ? "ChromaKnit runs on a free tier, so the engine takes a moment after a quiet stretch."
                  : "A moment please."}
              </p>
            </>
          ) : (
            <>
              <div className="upload-mark">+</div>
              <h5>Drop a garment photograph</h5>
              <p>
                A flat lay, a hung shot, or a finished piece you have knit. Even
                lighting and a quiet background help the engine read the texture.
              </p>
              <span className="upload-button">Choose a file</span>
              <small className="upload-fineprint">JPG or PNG, up to 5 MB</small>
            </>
          )}
        </div>

        <div className="garment-sample-strip">
          <p className="garment-sample-strip-label">
            <span className="caps">Or try a sample</span>
          </p>
          <div className="garment-sample-grid" role="group" aria-label="Garment samples">
            {GARMENT_SAMPLES.map((sample) => {
              const isThisLoading = uploadingSampleLabel === sample.label;
              return (
                <button
                  key={sample.label}
                  type="button"
                  className="garment-sample-tile"
                  onClick={() => handleSampleClick(sample)}
                  aria-label={`Use ${sample.label} sample`}
                  disabled={anyUploadInFlight}
                >
                  <div className="garment-sample-thumb">
                    <img src={sample.src} alt="" />
                    {isThisLoading && (
                      <span className="garment-sample-spinner" role="status" aria-label="Loading" />
                    )}
                  </div>
                  <div className="garment-sample-name">{titleCase(sample.label)}</div>
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
      </article>
    );
  }

  // ============== Loaded state ==============
  const yarnDisplay = activeYarn ? titleCase(activeYarn.label) : "";
  const metaCapsText = paintEnabled ? "Painting" : isRecoloring ? "Steeping" : "In revision";
  const metaItalicText = activeYarn
    ? `${paintEnabled ? "in" : "recoloured in"} ${yarnDisplay.toLowerCase()}`
    : "pick a yarn from the palette";

  return (
    <article className="garment-card" aria-label="Garment workspace">
      <div className="garment-fig-meta">
        <span className="caps">{metaCapsText}</span>
        <span className="italic">{metaItalicText}</span>
      </div>

      <div className="garment-image garment-image-corners">
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
          <div className="loading-veil" role="status" aria-label="Recolouring">
            <div className="loading-pulse"><span>&#x2726;</span></div>
            <div className="loading-title">Steeping the <em>wool</em></div>
            <div className="loading-sub">
              The engine is reading the texture and blending in the new colour.
              <span className="loading-dots"><span /><span /><span /></span>
            </div>
          </div>
        )}
      </div>

      <div className="garment-caption">
        <div className="garment-caption-main">
          {activeYarn && (currentRecolorUrl || regions.length > 0) ? (
            <>
              Lifted from black and white into <em>{yarnDisplay.toLowerCase()}</em>.
            </>
          ) : (
            <>Choose a yarn from the palette to begin.</>
          )}
        </div>
        <div className="garment-caption-side">
          {session.width} &times; {session.height}
        </div>
      </div>

      {paintEnabled ? (
        <div className="paint-tools" role="group" aria-label="Brush controls">
          <div className="paint-active">
            <span
              className="paint-active-swatch"
              style={{ background: activeYarn?.palette[0] ?? "transparent" }}
              aria-hidden="true"
            />
            <span className="paint-active-label">
              Painting in {yarnDisplay.toLowerCase()}
            </span>
          </div>
          <div className="brush-size">
            <label className="brush-size-label" htmlFor="brush-size-range">Brush</label>
            <input
              id="brush-size-range"
              type="range"
              className="brush-size-range"
              min={BRUSH_MIN}
              max={BRUSH_MAX}
              step={BRUSH_STEP}
              value={brushRadius}
              onChange={(e) => setBrushRadius(Number(e.target.value))}
              aria-label="Brush size in pixels"
              aria-valuetext={`${brushRadius} pixels`}
            />
            <span className="brush-size-value" aria-hidden="true">{brushRadius}<small>px</small></span>
          </div>
          <button
            type="button"
            className="paint-undo"
            onClick={onUndoLastRegion}
            disabled={regions.length === 0}
            title="Remove last paint stroke (Ctrl+Z)"
          >
            Undo
          </button>
        </div>
      ) : (currentRecolorUrl || regions.length > 0) ? (
        <div className="stage-tool-row">
          <div className="toggle-pill" role="tablist" aria-label="Comparison toggle">
            <button
              type="button"
              role="tab"
              aria-selected={!showOriginal}
              className={!showOriginal ? "is-active" : ""}
              onClick={() => setShowOriginal(false)}
            >
              Recoloured
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showOriginal}
              className={showOriginal ? "is-active" : ""}
              onClick={() => setShowOriginal(true)}
            >
              Original
            </button>
          </div>
        </div>
      ) : null}

      {(localError || error) && (
        <p className="garment-stage-error" role="alert">{localError || error}</p>
      )}
    </article>
  );
}

export default GarmentStage;
