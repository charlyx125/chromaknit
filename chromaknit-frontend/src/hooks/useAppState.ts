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

// --- State shape ---
// Transitional: new yarns[] / activeYarnId coexist with the legacy single-yarn
// fields. Step 3 of slice 1.A removes the legacy fields and rewrites the
// reducer to drive the multi-yarn shape end-to-end.
export interface AppState {
  resetKey: number;
  activeTab: number;
  showSampleStrip: boolean;
  // Yarn (new, multi)
  yarns: Yarn[];
  activeYarnId: string | null;
  // Yarn (legacy, single — to be removed in step 3 of slice 1.A)
  /** @deprecated use `yarns[]` — removed in step 3 of slice 1.A */
  yarnImage: File | null;
  /** @deprecated derive from `yarns.some(y => y.status === "pending")` — removed in step 3 of slice 1.A */
  isExtractingColors: boolean;
  /** @deprecated use `yarns.find(y => y.id === activeYarnId)?.palette` — removed in step 3 of slice 1.A */
  extractedColors: string[];
  /** @deprecated use `yarns.find(y => y.id === activeYarnId)?.percentages` — removed in step 3 of slice 1.A */
  colorPercentages: number[];
  // Garment
  garmentImage: File | null;
  garmentPreviewUrl: string | null;
  isRecoloring: boolean;
  recoloredImageUrl: string | null;
  // Error
  error: string | null;
}

export const initialState: AppState = {
  resetKey: 0,
  activeTab: 0,
  showSampleStrip: false,
  yarns: [],
  activeYarnId: null,
  yarnImage: null,
  isExtractingColors: false,
  extractedColors: [],
  colorPercentages: [],
  garmentImage: null,
  garmentPreviewUrl: null,
  isRecoloring: false,
  recoloredImageUrl: null,
  error: null,
};

// --- Actions ---
export type Action =
  | { type: "SET_TAB"; tab: number }
  | { type: "SHOW_STRIP" }
  | { type: "SET_YARN_IMAGE"; file: File }
  | { type: "START_EXTRACTION" }
  | { type: "EXTRACTION_SUCCESS"; colors: string[]; percentages: number[] }
  | { type: "EXTRACTION_ERROR"; error: string }
  | { type: "SET_GARMENT"; file: File; previewUrl: string }
  | { type: "CLEAR_GARMENT" }
  | { type: "START_RECOLOR" }
  | { type: "RECOLOR_SUCCESS"; imageUrl: string }
  | { type: "RECOLOR_ERROR"; error: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_FOR_NEW_YARN" }
  // Multi-yarn actions (new in slice 1.A)
  | { type: "ADD_YARN_PENDING"; id: string; label: string; previewUrl: string }
  | { type: "ADD_YARN_SUCCESS"; id: string; palette: string[]; percentages: number[] }
  | { type: "ADD_YARN_ERROR"; id: string; errorMessage: string }
  | { type: "REMOVE_YARN"; id: string }
  | { type: "SET_ACTIVE_YARN"; id: string | null }
  | { type: "HYDRATE_YARNS"; yarns: Yarn[] }
  | { type: "RESET" };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, activeTab: action.tab };

    case "SHOW_STRIP":
      return { ...state, showSampleStrip: true };

    case "SET_YARN_IMAGE":
      return { ...state, yarnImage: action.file, error: null };

    case "START_EXTRACTION":
      return { ...state, isExtractingColors: true, error: null };

    case "EXTRACTION_SUCCESS":
      return {
        ...state,
        isExtractingColors: false,
        extractedColors: action.colors,
        colorPercentages: action.percentages,
      };

    case "EXTRACTION_ERROR":
      return {
        ...state,
        isExtractingColors: false,
        extractedColors: [],
        colorPercentages: [],
        error: action.error,
      };

    case "SET_GARMENT":
      return {
        ...state,
        garmentImage: action.file,
        garmentPreviewUrl: action.previewUrl,
        recoloredImageUrl: null,
        error: null,
      };

    case "CLEAR_GARMENT":
      return {
        ...state,
        garmentImage: null,
        garmentPreviewUrl: null,
        recoloredImageUrl: null,
        isRecoloring: false,
        error: null,
      };

    case "START_RECOLOR":
      return { ...state, isRecoloring: true, error: null };

    case "RECOLOR_SUCCESS":
      return {
        ...state,
        isRecoloring: false,
        recoloredImageUrl: action.imageUrl,
      };

    case "RECOLOR_ERROR":
      return { ...state, isRecoloring: false, error: action.error };

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "CLEAR_FOR_NEW_YARN":
      return {
        ...state,
        extractedColors: [],
        colorPercentages: [],
        recoloredImageUrl: null,
        error: null,
        activeTab: 0,
      };

    // --- Multi-yarn cases (new in slice 1.A) ---
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
