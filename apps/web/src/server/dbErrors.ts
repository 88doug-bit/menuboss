/**
 * Map Postgres / PostgREST errors into typed TRPCErrors.
 * RLS denials and missing rows surface as FORBIDDEN / NOT_FOUND.
 * Unique violations (e.g. uq_ingredient_name) surface as CONFLICT.
 */
import { TRPCError } from "@trpc/server";

type PgLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export function throwFromPostgrest(
  error: PgLikeError,
  opts?: { notFoundMessage?: string; conflictMeta?: Record<string, unknown> },
): never {
  const code = error.code ?? "";
  const message = error.message ?? "Database error";

  // unique_violation
  if (code === "23505") {
    throw new TRPCError({
      code: "CONFLICT",
      message,
      cause: error,
      // callers may attach existing id via meta for merge-suggestion UX
      ...(opts?.conflictMeta
        ? { /* meta is not standard on TRPCError; stash on cause */ }
        : {}),
    });
  }

  // check_violation / not_null / fk
  if (code === "23514" || code === "23502" || code === "23503") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message,
      cause: error,
    });
  }

  // insufficient_privilege / RLS often appears as empty result or 42501
  if (code === "42501" || /row-level security/i.test(message)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not permitted",
      cause: error,
    });
  }

  // PostgREST "JWT expired" etc.
  if (code === "PGRST301" || /jwt/i.test(message)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Session invalid or expired",
      cause: error,
    });
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
    cause: error,
  });
}

export function assertFound<T>(
  row: T | null | undefined,
  message = "Not found",
): asserts row is T {
  if (row == null) {
    throw new TRPCError({ code: "NOT_FOUND", message });
  }
}

/**
 * Build a CONFLICT error carrying the existing resource id for merge UX
 * (ingredient duplicate-name AC).
 */
export function conflictWithExisting(
  message: string,
  existingId: string,
  extra?: Record<string, unknown>,
): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message,
    cause: { existingId, ...extra },
  });
}
