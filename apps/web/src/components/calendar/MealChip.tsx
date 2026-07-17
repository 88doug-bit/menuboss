"use client";

/**
 * Colored assignment chip (§9.5 visual language: emerald = shared family,
 * zinc = private household). Shared by the band week view and the mobile
 * day list. E2E contract: `calendar-plan-event`, chip text includes the
 * plan title (sr-only).
 */
import { cn } from "@/lib/utils";

export function MealChip({
  title,
  planTitle,
  isShared,
  onClick,
}: {
  title: string;
  planTitle: string;
  isShared: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs text-white",
    isShared ? "bg-emerald-700" : "bg-zinc-400",
    onClick && "cursor-pointer hover:opacity-90",
  );
  const content = (
    <>
      {isShared ? (
        <span aria-hidden title="Shared plan">
          👪{" "}
        </span>
      ) : null}
      {title}
      <span className="sr-only">{planTitle}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        title={`${planTitle} — ${title}`}
        data-testid="calendar-plan-event"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {content}
      </button>
    );
  }
  return (
    <span
      className={className}
      title={`${planTitle} — ${title}`}
      data-testid="calendar-plan-event"
    >
      {content}
    </span>
  );
}
