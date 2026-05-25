import { useEffect, useState } from "react";

// Hold a loading flag false for the first `delayMs` after it becomes true so
// fast operations (a cached recolour, a precomputed sample fetch, a quick
// file read) never flash their loading copy. Returns false while inactive or
// inside the grace window, then flips to true only if the source flag is
// still active when the timer fires.
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setShow(true), delayMs);
    // Reset on cleanup so the flag is false again the next time `active`
    // flips. Doing this inside cleanup keeps setState out of the effect
    // body, which the react-hooks lint rule disallows (it would cascade
    // an extra render every time `active` went false).
    return () => {
      window.clearTimeout(timer);
      setShow(false);
    };
  }, [active, delayMs]);
  return show;
}
