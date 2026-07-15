/**
 * Registers public/sw.js once on the client (production + explicit opt-in dev).
 * Hand-rolled SW — no @serwist/next (Next 16 Turbopack conflict risk; see NOTES).
 */
"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Skip registration in development unless forced (avoids stale SW during HMR).
    const force =
      process.env.NEXT_PUBLIC_ENABLE_SW === "1" ||
      process.env.NODE_ENV === "production";
    if (!force) return;

    let cancelled = false;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        // Check for updates periodically while the tab is open.
        const id = window.setInterval(() => {
          void reg.update();
        }, 60 * 60 * 1000);
        return () => window.clearInterval(id);
      })
      .catch((err) => {
        console.warn("[pwa] service worker registration failed", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
