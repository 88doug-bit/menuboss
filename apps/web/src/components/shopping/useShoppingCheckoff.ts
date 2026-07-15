/**
 * localStorage-backed shopping check-off state.
 * Keyed by sorted plan-id set. Server sync is Phase 2.
 * <!-- TODO(coordinator): Phase 2 check-state sync -->
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export function shoppingCheckoffStorageKey(planIds: string[]): string {
  const sorted = [...planIds].filter(Boolean).sort();
  return `menuboss:shopping-checkoff:${sorted.join(",") || "none"}`;
}

function readMap(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function useShoppingCheckoff(planIds: string[]) {
  const storageKey = useMemo(
    () => shoppingCheckoffStorageKey(planIds),
    [planIds],
  );
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked(readMap(storageKey));
  }, [storageKey]);

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      setChecked(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Quota / private mode — keep in-memory only.
      }
    },
    [storageKey],
  );

  const toggle = useCallback(
    (lineKey: string) => {
      persist({ ...checked, [lineKey]: !checked[lineKey] });
    },
    [checked, persist],
  );

  const isChecked = useCallback(
    (lineKey: string) => Boolean(checked[lineKey]),
    [checked],
  );

  const clearAll = useCallback(() => {
    persist({});
  }, [persist]);

  return { checked, toggle, isChecked, clearAll, storageKey };
}
