/**
 * Browser online/offline status for D4 read-only offline UX.
 * Defaults to online during SSR; hydrates from navigator.onLine.
 */
"use client";

import { useEffect, useState } from "react";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}

/** Tooltip / aria copy when write actions are blocked offline (D4). */
export const OFFLINE_WRITE_MESSAGE =
  "You're offline — changes can't be saved yet";
