import { useReducer } from "react";

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

const initialState: AppState = {
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
type Action =
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
  | { type: "RESET" };

function appReducer(state: AppState, action: Action): AppState {
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

export function useAppState() {
  return useReducer(appReducer, initialState);
}
