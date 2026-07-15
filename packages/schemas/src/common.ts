import { z } from "zod";

/** UUID v4-compatible string (accepts any UUID shape Postgres generates). */
export const uuidSchema = z.string().uuid();

/** Trimmed non-empty string helper. */
export const nonEmptyTrimmed = z
  .string()
  .trim()
  .min(1, "Must not be empty after trimming");

/** Make-again / opinion rating: integer 1–5 inclusive. */
export const ratingSchema = z
  .number()
  .int("Rating must be an integer")
  .min(1, "Rating must be at least 1")
  .max(5, "Rating must be at most 5");

/**
 * Cursor pagination input.
 * `cursor` is an opaque string (typically last-seen id or created_at+id).
 * `limit` defaults to 20, hard-capped at 100.
 */
export const paginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100, "limit must be ≤ 100")
    .default(20),
});

export type Uuid = z.infer<typeof uuidSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type Rating = z.infer<typeof ratingSchema>;

/** Shared id-only input for byId / softDelete / restore / rate targets. */
export const idInputSchema = z.object({
  id: uuidSchema,
});

export type IdInput = z.infer<typeof idInputSchema>;
