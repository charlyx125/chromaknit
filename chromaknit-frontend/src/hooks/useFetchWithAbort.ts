import { useRef, useCallback } from "react";

/**
 * Custom hook that wraps fetch with automatic AbortController management.
 * Aborts any in-flight request when a new one starts or on cleanup.
 */
export function useFetchWithAbort() {
  const controllerRef = useRef<AbortController | null>(null);

  const abortCurrent = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const fetchWithAbort = useCallback(
    async (url: string, options?: RequestInit): Promise<Response> => {
      abortCurrent();
      const controller = new AbortController();
      controllerRef.current = controller;

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return response;
    },
    [abortCurrent]
  );

  return { fetchWithAbort, abortCurrent };
}
