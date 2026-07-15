/**
 * MenuBoss service worker — PWA shell + static assets only (D4).
 *
 * READ-ONLY offline (Product PRD §6.8):
 * - App shell + static: stale-while-revalidate / network-first navigations.
 * - API / tRPC: NOT cached here. TanStack Query persister owns read-data cache.
 * - NEVER cache or replay POST / mutations.
 * - NO background sync, NO periodicsync, NO write queues.
 */
/* eslint-disable no-restricted-globals */

const SHELL_CACHE = "menuboss-shell-v1";

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * D4 hard boundary: never touch non-GET. No offline mutation replay.
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Same-origin API (tRPC queries/mutations over HTTP) — pass through.
  // Query responses are persisted by @tanstack/react-query-persist-client.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Cross-origin (fonts, analytics, etc.) — browser default.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Document navigations: network-first, fall back to cached shell.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      void cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last resort: any cached HTML shell (start_url).
    const shell = await caches.match("/calendar");
    if (shell) return shell;
    return new Response(
      "<!doctype html><title>MenuBoss offline</title><body><h1>You're offline</h1><p>Reconnect to load MenuBoss.</p></body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
}

// Explicit non-registration of background sync / periodicsync.
// Reviewers: grep this file — no sync event listeners, no write queues.
