/**
 * TanStack Query persistence helpers for D4 read-only offline.
 *
 * Chosen over SW-level API caching: tRPC uses batched HTTP with superjson;
 * Query cache already holds typed results and respects per-user auth sessions.
 * Mutations are never dehydrated (default + explicit filter).
 */
import type { Query } from "@tanstack/react-query";

/** Family-global catalog + upcoming plans + safety-relevant reads. */
const PERSIST_ROUTERS = new Set([
  "recipe",
  "chefIdea",
  "recipeCombination",
  "ingredient",
  "category",
  "tag",
  "mealPlan",
  "family",
]);

/**
 * tRPC + tanstack-react-query key shape:
 *   [["router", "proc"], { input, type: "query" | "mutation" }]
 */
export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== "success") return false;

  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) return false;

  const path = key[0];
  if (!Array.isArray(path) || typeof path[0] !== "string") return false;

  const router = path[0];
  if (!PERSIST_ROUTERS.has(router)) return false;

  const meta = key[1] as { type?: string } | undefined;
  if (meta?.type === "mutation") return false;

  return true;
}

export const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h
export const PERSIST_STORAGE_KEY = "menuboss-rq-cache-v1";

export const RECENT_SEARCHES_KEY = "menuboss-recent-searches-v1";
const CHECKOFF_KEY_PREFIX = "menuboss:shopping-checkoff:";
const SW_SHELL_CACHE = "menuboss-shell-v1";

/**
 * D4 / shared-device hygiene: wipe the persisted read cache. Called on
 * sign-out so the next user of this browser never sees cached family data.
 */
export function clearPersistedQueryCache(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(PERSIST_STORAGE_KEY);
  }
}

/**
 * Full client-state wipe on session end: RQ persisted cache, recent searches,
 * shopping check-off state, and the service worker's cached navigation shells
 * (authenticated HTML). Fire-and-forget on the async parts.
 */
export function clearClientState(): void {
  if (typeof window === "undefined") return;

  clearPersistedQueryCache();
  window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(CHECKOFF_KEY_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }
  if ("caches" in window) {
    void window.caches.delete(SW_SHELL_CACHE).catch(() => {});
  }
}
