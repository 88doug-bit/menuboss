/**
 * TanStack QueryClient factory (browser singleton + server per-request).
 * Shared with Task 11 — do not instantiate a second QueryClient tree.
 *
 * gcTime elevated so PersistQueryClientProvider can restore offline reads (D4).
 */
import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from "@tanstack/react-query";

import { PERSIST_MAX_AGE_MS } from "@/lib/offline/persistQuery";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Must be ≥ persister maxAge so restored queries are not immediately GC'd.
        gcTime: PERSIST_MAX_AGE_MS,
        refetchOnWindowFocus: false,
        // Network-first UX: prefer network when online; cache is the offline fallback.
        networkMode: "offlineFirst",
      },
      mutations: {
        // D4: never queue mutations while offline.
        networkMode: "online",
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
