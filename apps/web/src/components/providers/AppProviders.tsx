/**
 * Root client providers: Session (outermost) + QueryClient (persisted,
 * per-user busted) + tRPC + PWA helpers. Single provider tree for the whole
 * app — do not create a second TRPCProvider/QueryClient anywhere (splits the
 * cache and breaks realtime invalidation).
 *
 * Offline data cache: @tanstack/react-query-persist-client + localStorage.
 * Mutations are never persisted or replayed (D4). The persisted snapshot is
 * BUSTED per user id — a different user (or anon) can never rehydrate someone
 * else's cache — and clearClientState() wipes everything on session end.
 */
"use client";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";

import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { OfflineReconnect } from "@/components/pwa/OfflineReconnect";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import {
  PERSIST_MAX_AGE_MS,
  PERSIST_STORAGE_KEY,
  shouldPersistQuery,
} from "@/lib/offline/persistQuery";
import { TRPCProvider, createAppTRPCClient } from "@/lib/trpc/client";
import { getQueryClient } from "@/lib/trpc/query-client";
import { SessionProvider, useSession } from "@/providers/SessionProvider";

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function PersistedProviders({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() => createAppTRPCClient());
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : noopStorage,
      key: PERSIST_STORAGE_KEY,
    }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE_MS,
        // Per-user snapshot isolation: a restore only happens when the stored
        // buster matches the CURRENT user id. While the session is still
        // loading we use a non-matching sentinel so nothing rehydrates early.
        buster: loading ? "session-loading" : (user?.id ?? "anon"),
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
          // Never dehydrate mutations (D4 — no offline write queue).
          shouldDehydrateMutation: () => false,
        },
      }}
    >
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <ServiceWorkerRegister />
        <OfflineReconnect />
        <OfflineBanner />
        {children}
      </TRPCProvider>
    </PersistQueryClientProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <PersistedProviders>{children}</PersistedProviders>
    </SessionProvider>
  );
}
