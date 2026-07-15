/**
 * Root client providers: QueryClient + tRPC + Session.
 * Single provider tree for the whole app — do not create a second
 * TRPCProvider/QueryClient anywhere (splits the cache and breaks
 * realtime invalidation).
 */
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { TRPCProvider, createAppTRPCClient } from "@/lib/trpc/client";
import { getQueryClient } from "@/lib/trpc/query-client";
import { SessionProvider } from "@/providers/SessionProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() => createAppTRPCClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
