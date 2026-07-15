/**
 * Recipe card for browser grid.
 */
import Link from "next/link";

import { DeletedBadge } from "@/components/shared/DeletedBadge";

export function RecipeCard({
  id,
  title,
  description,
  totalTimeMinutes,
  makeAgainRating,
  isDeleted,
}: {
  id: string;
  title: string;
  description?: string | null;
  totalTimeMinutes?: number | null;
  makeAgainRating?: number | null;
  isDeleted?: boolean;
}) {
  return (
    <Link
      href={`/recipes/${id}`}
      data-testid="recipe-card"
      className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-zinc-900">{title}</h3>
        {isDeleted ? <DeletedBadge /> : null}
      </div>
      {description ? (
        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{description}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-3 text-xs text-zinc-500">
        {totalTimeMinutes != null ? <span>{totalTimeMinutes} min</span> : null}
        {makeAgainRating != null ? (
          <span aria-label={`Rated ${makeAgainRating} of 5`}>
            ★ {makeAgainRating}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/** Visually distinct ChefIdea card interleaved in recipe search (§9.2). */
export function ChefIdeaSearchCard({
  id,
  title,
  notes,
  status,
}: {
  id: string;
  title: string;
  notes?: string | null;
  status?: string;
}) {
  return (
    <Link
      href={`/ideas/${id}`}
      data-testid="chef-idea-search-card"
      className="flex flex-col rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/60 p-4 transition hover:border-sky-400 hover:bg-sky-50"
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-sky-200/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
          Idea
        </span>
        {status ? (
          <span className="text-xs capitalize text-sky-800">{status}</span>
        ) : null}
      </div>
      <h3 className="mt-1 font-semibold text-sky-950">{title}</h3>
      {notes ? (
        <p className="mt-1 line-clamp-2 text-sm text-sky-900/80">{notes}</p>
      ) : null}
    </Link>
  );
}
