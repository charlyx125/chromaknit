import { useEffect, useReducer, useRef, type Dispatch } from "react";

/**
 * Reducer-based state for ChromaKnit's main UI.
 *
 * The `appReducer` below is a pure function: given the current state and an
 * action, it returns the next state. 
 * 
 * It never fetches, reads files, generates UUIDs, or runs any other side effects. 
 * All of that lives in the components that dispatch the actions (primarily `src/App.tsx`).
 *
 * Flow:
 *   1. A component does some work (e.g. POST /api/colors/extract).
 *   2. The component dispatches an action describing what happened
 *      (e.g. ADD_YARN_SUCCESS with the extracted palette as payload).
 *   3. The switch statement below maps that action to a new state object.
 *   4. React re-renders any component that reads the changed fields.
 *
 * This separation makes the reducer trivially testable (no mocks needed) and
 * keeps every state transition discoverable in one switch statement.
 *
 * Action naming convention: actions describe what *already happened*, not
 * what *to do*. So `ADD_YARN_SUCCESS` (component finished an extraction and
 * is reporting the result) rather than `FETCH_YARN` (would imply the reducer
 * itself does the fetching, which it does not).
 */

// --- Yarn entity ---
export type YarnStatus = "pending" | "ready" | "error";

export interface Yarn {
  id: string;
  label: string;
  previewUrl: string;       // data URL for uploads, static path for samples
  palette: string[];        // hex codes; [] while pending
  percentages: number[];    // [] while pending
  status: YarnStatus;
  errorMessage?: string;    // populated when status === "error"
}

// --- Garment session ---
export interface GarmentSession {
  sessionId: string;        // server-side session id from POST /api/garments/session
  previewUrl: string;       // local blob URL of the original garment for the BeforeAfter slider
  width: number;
  height: number;
  // rembg foreground mask, decoded from the session response. Used by paint
  // mode to clip strokes to the garment outline so brushes cannot bleed onto
  // the background. 1-channel uint8; values >= 128 are foreground.
  foregroundMask: Uint8Array;
  // Garment-wide brightness range (2nd / 98th percentile of V over the
  // foreground). Computed once when the session is created and reused for
  // every paint stroke, so adjacent strokes normalise against the same
  // shadow-to-highlight span and don't produce visible seams.
  brightnessRange: { minV: number; maxV: number };
  // V = max(R, G, B) for every pixel of the ORIGINAL photo. Read-only.
  // Paint mode passes this to recolourLocal so an overlapping stroke reads
  // V from the original (not from the already-painted canvas), which would
  // otherwise produce a different shade of the same yarn in the overlap.
  sourceV: Uint8Array;
}

// --- Modes and regions (Phase 2) ---
// Auto: current Phase 1 behaviour. The whole foreground gets recoloured with
// the active yarn.
// Paint: user drags strokes to paint specific regions with the active yarn.
//        Each commit produces a Region with a stroke-derived mask.
// Select: user clicks a click-similar region to fill it (Phase 3, stubbed for now).
export type Mode = "auto" | "paint" | "select";

export interface Region {
  id: string;
  yarnId: string;
  source: "auto" | "paint" | "select";
  // mask is base64-encoded PNG bytes for serialization. The canvas builds the
  // mask as ImageData; we encode on commit so the region is portable across
  // network and storage boundaries.
  maskPngBase64: string;
  createdAt: number;
}

// --- State shape ---
export interface AppState {
  resetKey: number;
  showSampleStrip: boolean;
  yarns: Yarn[];
  activeYarnId: string | null;
  // Garment workflow (slice 1.C)
  garmentSession: GarmentSession | null;
  isRecoloring: boolean;
  // currentRecolorUrl is the blob URL currently displayed in the BeforeAfter
  // slider. It is set from the per-yarn cache on cache hits and from the
  // /api/garments/recolor response on cache misses.
  currentRecolorUrl: string | null;
  // Modes and regions (Phase 2). Auto mode keeps Phase 1 behaviour; regions
  // is unused in auto mode and grows as the user commits paint or select
  // strokes.
  activeMode: Mode;
  regions: Region[];
  error: string | null;
}

export const initialState: AppState = {
  resetKey: 0,
  showSampleStrip: false,
  yarns: [],
  activeYarnId: null,
  garmentSession: null,
  isRecoloring: false,
  currentRecolorUrl: null,
  activeMode: "auto",
  regions: [],
  error: null,
};

// --- Actions ---
export type Action =
  | { type: "SHOW_STRIP" }
  | { type: "HIDE_STRIP" }
  | { type: "SET_ERROR"; error: string }
  | { type: "ADD_YARN_PENDING"; id: string; label: string; previewUrl: string }
  | { type: "ADD_YARN_SUCCESS"; id: string; palette: string[]; percentages: number[] }
  | { type: "ADD_YARN_ERROR"; id: string; errorMessage: string }
  | { type: "REMOVE_YARN"; id: string }
  | { type: "SET_ACTIVE_YARN"; id: string | null }
  | { type: "HYDRATE_YARNS"; yarns: Yarn[] }
  // Garment workflow (slice 1.C)
  | { type: "SET_GARMENT_SESSION"; session: GarmentSession }
  | { type: "CLEAR_GARMENT" }
  | { type: "START_RECOLOR" }
  | { type: "RECOLOR_SUCCESS"; url: string }
  | { type: "RECOLOR_ERROR"; error: string }
  // Modes and regions (Phase 2)
  | { type: "SET_MODE"; mode: Mode }
  | { type: "COMMIT_REGION"; region: Region }
  | { type: "REMOVE_REGION"; id: string }
  | { type: "CLEAR_REGIONS" }
  | { type: "RESET" };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SHOW_STRIP":
      return { ...state, showSampleStrip: true };

    case "HIDE_STRIP":
      return { ...state, showSampleStrip: false };

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "ADD_YARN_PENDING":
      return {
        ...state,
        yarns: [
          ...state.yarns,
          {
            id: action.id,
            label: action.label,
            previewUrl: action.previewUrl,
            palette: [],
            percentages: [],
            status: "pending",
          },
        ],
      };

    case "ADD_YARN_SUCCESS":
      return {
        ...state,
        yarns: state.yarns.map(yarn =>
          yarn.id === action.id
            ? { ...yarn, status: "ready", palette: action.palette, percentages: action.percentages }
            : yarn
        ),
      };

    case "ADD_YARN_ERROR":
      return {
        ...state,
        yarns: state.yarns.map(yarn =>
          yarn.id === action.id
            ? { ...yarn, status: "error", errorMessage: action.errorMessage }
            : yarn
        ),
      };

    case "REMOVE_YARN":
      return {
        ...state,
        yarns: state.yarns.filter(yarn => yarn.id !== action.id),
        activeYarnId: state.activeYarnId === action.id ? null : state.activeYarnId,
      };

    case "SET_ACTIVE_YARN":
      return { ...state, activeYarnId: action.id };

    case "HYDRATE_YARNS":
      return { ...state, yarns: action.yarns };

    // --- Garment workflow (slice 1.C) ---
    case "SET_GARMENT_SESSION":
      return {
        ...state,
        garmentSession: action.session,
        currentRecolorUrl: null,
        error: null,
      };

    case "CLEAR_GARMENT":
      return {
        ...state,
        garmentSession: null,
        currentRecolorUrl: null,
        isRecoloring: false,
        // Regions are tied to the garment's mask coordinate space; a new
        // garment invalidates them.
        regions: [],
        activeMode: "auto",
        error: null,
      };

    case "START_RECOLOR":
      return { ...state, isRecoloring: true, error: null };

    case "RECOLOR_SUCCESS":
      return {
        ...state,
        isRecoloring: false,
        currentRecolorUrl: action.url,
      };

    case "RECOLOR_ERROR":
      return { ...state, isRecoloring: false, error: action.error };

    // --- Modes and regions (Phase 2) ---
    case "SET_MODE":
      return { ...state, activeMode: action.mode };

    case "COMMIT_REGION":
      return { ...state, regions: [...state.regions, action.region] };

    case "REMOVE_REGION":
      return {
        ...state,
        regions: state.regions.filter((r) => r.id !== action.id),
      };

    case "CLEAR_REGIONS":
      return { ...state, regions: [] };

    case "RESET":
      return {
        ...initialState,
        showSampleStrip: state.showSampleStrip,
        resetKey: state.resetKey + 1,
      };

    default:
      return state;
  }
}

// --- localStorage persistence ---
// Yarn palettes are user-owned data (not server-derived), so they live in
// localStorage. The schema is versioned so future shape changes can be
// detected and discarded cleanly rather than crashing the UI.

const STORAGE_KEY = "chromaknit:state";
const STORAGE_VERSION = 1;

function tryHydrateFromLocalStorage(dispatch: Dispatch<Action>): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== STORAGE_VERSION) return;
    if (!Array.isArray(parsed.yarns)) return;
    dispatch({ type: "HYDRATE_YARNS", yarns: parsed.yarns });
  } catch {
    // Malformed JSON or storage unavailable; start fresh.
  }
}

function persistYarnsToLocalStorage(yarns: Yarn[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, yarns }),
    );
  } catch {
    // Quota exceeded, private browsing, or storage unavailable. Best-effort.
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const skipFirstPersistRef = useRef(true);

  // Hydrate on mount: read localStorage, validate version, dispatch HYDRATE_YARNS.
  useEffect(() => {
    tryHydrateFromLocalStorage(dispatch);
  }, []);

  // Persist whenever yarns change, except on the very first render — that
  // call fires before the hydrate effect's dispatch can update state, and
  // would otherwise overwrite saved yarns with the empty initial state.
  useEffect(() => {
    if (skipFirstPersistRef.current) {
      skipFirstPersistRef.current = false;
      return;
    }
    persistYarnsToLocalStorage(state.yarns);
  }, [state.yarns]);

  return [state, dispatch] as const;
}
