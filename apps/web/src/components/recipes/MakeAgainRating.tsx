/**
 * 1–5 make-again rating with optimistic update + rollback on error (§9.6).
 * Pure controlled component: parent owns optimistic state or uses the hook.
 */
"use client";

import { useCallback, useState } from "react";

export type RateHandler = (rating: number) => Promise<void>;

/**
 * Manages optimistic rating value; rolls back when `onRate` rejects.
 */
export function useOptimisticRating(
  initial: number | null | undefined,
  onRate: RateHandler,
) {
  const [value, setValue] = useState<number | null>(initial ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = useCallback(
    async (next: number) => {
      const previous = value;
      setValue(next);
      setPending(true);
      setError(null);
      try {
        await onRate(next);
      } catch (err) {
        setValue(previous);
        setError(err instanceof Error ? err.message : "Failed to save rating");
      } finally {
        setPending(false);
      }
    },
    [onRate, value],
  );

  /** Sync external initial when it changes and we are not pending. */
  const syncFromServer = useCallback(
    (server: number | null | undefined) => {
      if (!pending) setValue(server ?? null);
    },
    [pending],
  );

  return { value, pending, error, rate, setValue, syncFromServer };
}

export function MakeAgainRating({
  value,
  onRate,
  pending = false,
  disabled = false,
  label = "Make-again rating",
}: {
  value: number | null;
  onRate: (rating: number) => void | Promise<void>;
  pending?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-testid="make-again-rating"
      className="flex items-center gap-1"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            data-testid={`rating-star-${n}`}
            aria-label={`Rate ${n} of 5`}
            aria-pressed={value === n}
            disabled={disabled || pending}
            onClick={() => void onRate(n)}
            className={[
              "h-8 w-8 rounded-md text-lg leading-none transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600",
              "disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "text-amber-500 hover:text-amber-600"
                : "text-zinc-300 hover:text-amber-400",
            ].join(" ")}
          >
            ★
          </button>
        );
      })}
      {pending ? (
        <span className="ml-1 text-xs text-zinc-500" data-testid="rating-pending">
          Saving…
        </span>
      ) : null}
    </div>
  );
}
