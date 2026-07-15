import Link from "next/link";

export function CombinationCard({
  id,
  name,
  notes,
  makeAgainRating,
  isTemplate,
}: {
  id: string;
  name: string;
  notes?: string | null;
  makeAgainRating?: number | null;
  isTemplate?: boolean;
}) {
  return (
    <Link
      href={`/recipes/combinations/${id}`}
      data-testid="combination-card"
      className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-emerald-300"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-zinc-900">{name}</h3>
        {isTemplate ? (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
            Template
          </span>
        ) : null}
      </div>
      {notes ? (
        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{notes}</p>
      ) : null}
      {makeAgainRating != null ? (
        <p className="mt-2 text-xs text-zinc-500">★ {makeAgainRating}</p>
      ) : null}
    </Link>
  );
}
