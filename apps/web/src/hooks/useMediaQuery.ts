"use client";

import { useEffect, useState } from "react";

/**
 * Media-query hook that returns `null` until mounted (SSR-safe), then tracks
 * the query live. Used to mount exactly ONE calendar variant at a time —
 * CSS-only hiding kept both in the DOM, which breaks Playwright strict-mode
 * lookups and clicks on the hidden variant (E2E contract, §9.3).
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
