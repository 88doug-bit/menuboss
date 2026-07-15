/**
 * tRPC v11 init for MenuBoss.
 *
 * Context carries a per-request Supabase client built from the caller's JWT
 * and the session. Authorization is owned by RLS — procedures do not check
 * household/roles themselves. `adminProcedure` is display/UX gating only
 * (profile role via `is_family_admin` RPC); RLS still enforces writes.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import superjson from "superjson";
import { ZodError } from "zod";

export type AppSupabaseClient = SupabaseClient;

export type TRPCContext = {
  supabase: AppSupabaseClient;
  session: Session | null;
};

/**
 * Build context from a request. Caller (Next.js route handler) is responsible
 * for creating the Supabase server client with the request cookies/auth header
 * via `@supabase/ssr` `createServerClient` — never a service-role key.
 */
export function createTRPCContext(opts: {
  supabase: AppSupabaseClient;
  session: Session | null;
}): TRPCContext {
  return {
    supabase: opts.supabase,
    session: opts.session,
  };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/** Rejects unauthenticated callers. Session user id is available as ctx.userId. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.user.id as string,
    },
  });
});

/**
 * Authed + family-admin display gate via `is_family_admin` RPC.
 * RLS remains the sole write authority; this only keeps non-admins out of
 * admin-oriented procedures in the UI contract.
 */
export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const { data, error } = await ctx.supabase.rpc("is_family_admin");
  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to resolve admin role",
      cause: error,
    });
  }
  if (data !== true) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Family admin role required",
    });
  }
  return next({ ctx });
});
