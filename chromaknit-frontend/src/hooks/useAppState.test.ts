import { describe, it, expect } from "vitest";
import { appReducer, initialState } from "./useAppState";

/**
 * Reducer tests are pure: dispatch an action against a known state and assert
 * the resulting state. No React, no fetch, no DOM — just (state, action) → state.
 *
 * Pattern for each test:
 *   1. Build a starting state (often by spreading `initialState`).
 *   2. Build an action object (TypeScript will narrow it against the Action union).
 *   3. Call appReducer(state, action).
 *   4. Assert against the result.
 */

describe("appReducer", () => {
  describe("ADD_YARN_PENDING", () => {
    it("appends a new yarn with status 'pending' and empty palette", () => {
      const result = appReducer(initialState, {
        type: "ADD_YARN_PENDING",
        id: "yarn-1",
        label: "plum",
        previewUrl: "/samples/plum.jpg",
      });

      expect(result.yarns).toHaveLength(1);
      expect(result.yarns[0]).toEqual({
        id: "yarn-1",
        label: "plum",
        previewUrl: "/samples/plum.jpg",
        palette: [],
        percentages: [],
        status: "pending",
      });
    });
  });

  describe("ADD_YARN_SUCCESS", () => {
    it("flips status to 'ready' and fills palette/percentages for the matching yarn", () => {
      // Starting state: one pending yarn already exists
      const state = {
        ...initialState,
        yarns: [
          {
            id: "yarn-1",
            label: "plum",
            previewUrl: "/samples/plum.jpg",
            palette: [],
            percentages: [],
            status: "pending" as const,
          },
        ],
      };

      const result = appReducer(state, {
        type: "ADD_YARN_SUCCESS",
        id: "yarn-1",
        palette: ["#440022", "#aa3344"],
        percentages: [0.6, 0.4],
      });

      expect(result.yarns).toHaveLength(1);
      expect(result.yarns[0]).toEqual({
        id: "yarn-1",
        label: "plum",
        previewUrl: "/samples/plum.jpg",
        palette: ["#440022", "#aa3344"],
        percentages: [0.6, 0.4],
        status: "ready",
      });
    });

    it("is a no-op when the id does not match any existing yarn (resurrection guard)", () => {
      // If the user removed a yarn before its extraction finished, the
      // late-arriving SUCCESS dispatch must NOT bring it back.
      const state = {
        ...initialState,
        yarns: [
          {
            id: "yarn-1",
            label: "plum",
            previewUrl: "/samples/plum.jpg",
            palette: [],
            percentages: [],
            status: "pending" as const,
          },
        ],
      };

      const result = appReducer(state, {
        type: "ADD_YARN_SUCCESS",
        id: "yarn-999",
        palette: ["#ffffff"],
        percentages: [1.0],
      });

      expect(result.yarns).toEqual(state.yarns);
    });
  });

  describe("ADD_YARN_ERROR", () => {
    it("flips status to 'error' and sets errorMessage for the matching yarn", () => {
      const state = {
        ...initialState,
        yarns: [
          {
            id: "yarn-1",
            label: "plum",
            previewUrl: "/samples/plum.jpg",
            palette: [],
            percentages: [],
            status: "pending" as const,
          },
        ],
      };

      const result = appReducer(state, {
        type: "ADD_YARN_ERROR",
        id: "yarn-1",
        errorMessage: "extraction failed",
      });

      expect(result.yarns).toHaveLength(1); // yarn stays in the array
      expect(result.yarns[0]).toEqual({
        id: "yarn-1",
        label: "plum",
        previewUrl: "/samples/plum.jpg",
        palette: [],
        percentages: [],
        status: "error",
        errorMessage: "extraction failed",
      });
    });
  });

  describe("REMOVE_YARN", () => {
    it("removes the matching yarn and clears activeYarnId if it was active", () => {
      const state = {
        ...initialState,
        yarns: [
          {
            id: "yarn-1",
            label: "plum",
            previewUrl: "/samples/plum.jpg",
            palette: ["#440022", "#aa3344"],
            percentages: [0.6, 0.4],
            status: "ready" as const,
          },
        ],
        activeYarnId: "yarn-1", // ← key setup detail
      };

      const result = appReducer(state, {
        type: "REMOVE_YARN",
        id: "yarn-1",
      });

      expect(result.yarns).toHaveLength(0);
      expect(result.activeYarnId).toBeNull(); // result, not initialState
    });

    it("leaves activeYarnId unchanged when a different yarn is removed", () => {
      const state = {
        ...initialState,
        yarns: [
          {
            id: "yarn-1",
            label: "plum",
            previewUrl: "/samples/plum.jpg",
            palette: ["#440022", "#aa3344"],
            percentages: [0.6, 0.4],
            status: "ready" as const,
          },
          {
            id: "yarn-2",
            label: "blue",
            previewUrl: "/samples/blue.jpg",
            palette: ["#440022", "#aa3344"],
            percentages: [0.6, 0.4],
            status: "ready" as const,
          },
        ],
        activeYarnId: "yarn-1", // ← key setup detail
      };

      const result = appReducer(state, {
        type: "REMOVE_YARN",
        id: "yarn-2",
      });

      expect(result.yarns).toHaveLength(1);
      expect(result.activeYarnId).toBe("yarn-1");
    });
  });

  describe("HYDRATE_YARNS", () => {
    it("replaces the existing yarns array with the action payload", () => {
      // Hydration arrives on app mount with whatever localStorage held.
      // Whatever was previously in state.yarns gets overwritten wholesale.
      const state = {
        ...initialState,
        yarns: [
          {
            id: "stale-yarn",
            label: "old",
            previewUrl: "/samples/old.jpg",
            palette: [],
            percentages: [],
            status: "pending" as const,
          },
        ],
      };

      const hydratedYarns = [
        {
          id: "yarn-a",
          label: "rose",
          previewUrl: "/samples/rose.jpg",
          palette: ["#ff66aa"],
          percentages: [1.0],
          status: "ready" as const,
        },
        {
          id: "yarn-b",
          label: "mint",
          previewUrl: "/samples/mint.jpg",
          palette: ["#88ddaa"],
          percentages: [1.0],
          status: "ready" as const,
        },
      ];

      const result = appReducer(state, {
        type: "HYDRATE_YARNS",
        yarns: hydratedYarns,
      });

      expect(result.yarns).toEqual(hydratedYarns);
      expect(result.yarns).toHaveLength(2);
    });
  });
});
