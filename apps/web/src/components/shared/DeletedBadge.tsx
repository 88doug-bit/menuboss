/** Soft-deleted entity badge — historical context only. */
export function DeletedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="deleted-badge"
      className={`inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 ${className}`}
    >
      deleted
    </span>
  );
}
