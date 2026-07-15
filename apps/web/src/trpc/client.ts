"use client";

/**
 * COMPATIBILITY SHIM — the canonical tRPC client lives in @/lib/trpc/client.
 * Two parallel stacks were materialized in Wave 2; this re-export keeps Task 11
 * imports working against the single canonical context (one provider, one
 * QueryClient — a second context would silently split the cache).
 */
export { TRPCProvider, useTRPC, useTRPCClient } from "@/lib/trpc/client";
export { createAppTRPCClient as makeTRPCClient } from "@/lib/trpc/client";
