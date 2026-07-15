/**
 * Thoughtful empty states per §9.6.
 */
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center"
    >
      <p className="text-base font-medium text-zinc-800">{title}</p>
      {description ? (
        <p className="text-sm text-zinc-600">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
