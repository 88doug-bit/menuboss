/**
 * ChefIdea browser with filter surface + status chips + Capture CTA.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ContentFilters,
  emptyFilters,
  type ContentFilterState,
} from "@/components/shared/ContentFilters";
import { StatusChip } from "@/components/shared/StatusChip";
import { EmptyState } from "@/components/shell/EmptyState";
import { useTRPC } from "@/lib/trpc/client";
import type { ChefIdeaStatus } from "@menu-boss/schemas";

const STATUSES: ChefIdeaStatus[] = [
  "idea",
  "researching",
  "tested",
  "adopted",
  "abandoned",
];

function statusTone(
  s: string,
): "idea" | "researching" | "tested" | "adopted" | "abandoned" | "neutral" {
  if (
    s === "idea" ||
    s === "researching" ||
    s === "tested" ||
    s === "adopted" ||
    s === "abandoned"
  ) {
    return s;
  }
  return "neutral";
}

export function ChefIdeaBrowser({
  onCapture,
}: {
  onCapture: () => void;
}) {
  const trpc = useTRPC();
  const [filters, setFilters] = useState<ContentFilterState>(emptyFilters);
  const [status, setStatus] = useState<ChefIdeaStatus | "">("");

  const categoriesQuery = useQuery(
    trpc.category.list.queryOptions({ activeOnly: true }),
  );
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));

  const listInput = useMemo(() => {
    return {
      limit: 40 as const,
      q: filters.q.trim() || undefined,
      status: status || undefined,
      categoryIds: filters.categoryIds.length
        ? filters.categoryIds
        : undefined,
      tagIds: filters.tagIds.length ? filters.tagIds : undefined,
    };
  }, [filters, status]);

  const listQuery = useQuery(trpc.chefIdea.list.queryOptions(listInput));

  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
          <button
            type="button"
            onClick={() => setStatus("")}
            className={[
              "rounded-full px-2.5 py-1 text-xs font-medium",
              status === ""
                ? "bg-zinc-800 text-white"
                : "bg-zinc-100 text-zinc-700",
            ].join(" ")}
          >
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`status-filter-${s}`}
              onClick={() => setStatus(s)}
              className={[
                "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                status === s
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-700",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="capture-idea-header"
          onClick={onCapture}
          className="hidden rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 sm:inline-flex"
        >
          + Capture Idea
        </button>
      </div>

      <ContentFilters
        value={filters}
        onChange={setFilters}
        categories={categoriesQuery.data?.tree ?? []}
        tags={tags}
        showTimeAndRating={false}
        showSafetyFlag={false}
        searchPlaceholder="Search ideas…"
      />

      {listQuery.isLoading ? (
        <p className="text-sm text-zinc-500">Loading ideas…</p>
      ) : null}

      {!listQuery.isLoading && (listQuery.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="Capture your first ChefIdea"
          description="Note a promising dish, source, or technique — convert it to a recipe when ready."
          action={
            <button
              type="button"
              onClick={onCapture}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              + Capture Idea
            </button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(listQuery.data?.items ?? []).map((idea) => (
            <li key={idea.id}>
              <Link
                href={`/ideas/${idea.id}`}
                data-testid="chef-idea-card"
                className="block rounded-xl border border-sky-200 bg-sky-50/40 p-4 hover:border-sky-400"
              >
                <div className="flex items-center gap-2">
                  <StatusChip tone={statusTone(idea.status)}>
                    {idea.status}
                  </StatusChip>
                  {idea.priority != null ? (
                    <span className="text-xs text-zinc-500">
                      P{idea.priority}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-1 font-semibold text-zinc-900">{idea.title}</h3>
                {idea.notes ? (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
                    {idea.notes}
                  </p>
                ) : null}
                {idea.convertedRecipeId ? (
                  <p className="mt-2 text-xs text-emerald-700">
                    Adopted → recipe
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Mobile FAB */}
      <button
        type="button"
        data-testid="capture-idea-fab"
        onClick={onCapture}
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-2xl font-light text-white shadow-lg hover:bg-sky-700 sm:hidden md:bottom-6"
        aria-label="Capture Idea"
      >
        +
      </button>
    </div>
  );
}

export function ChefIdeaCaptureForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery(
    trpc.category.list.queryOptions({ activeOnly: true }),
  );
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<ChefIdeaStatus>("idea");
  const [priority, setPriority] = useState<string>("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation(
    trpc.chefIdea.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(trpc.chefIdea.list.queryFilter());
        onCreated(created.id);
      },
    }),
  );

  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];
  const flatCats = categoriesQuery.data?.flat ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        notes: notes.trim() || undefined,
        source: source.trim() || undefined,
        status,
        priority: priority ? (Number(priority) as 1 | 2 | 3) : undefined,
        categoryIds,
        tagIds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save idea");
    }
  }

  function toggle(ids: string[], id: string) {
    return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-idea-title"
      data-testid="capture-idea-form"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="capture-idea-title" className="text-lg font-semibold">
            Capture Idea
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-700">
            Title
            <input
              required
              data-testid="idea-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            Notes
            <textarea
              data-testid="idea-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            Source
            <input
              data-testid="idea-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm font-medium text-zinc-700">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ChefIdeaStatus)}
                className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                <option value="1">1 (highest)</option>
                <option value="2">2</option>
                <option value="3">3 (lowest)</option>
              </select>
            </label>
          </div>

          {flatCats.length > 0 ? (
            <fieldset>
              <legend className="text-sm font-medium text-zinc-700">
                Categories
              </legend>
              <ul className="mt-1 flex flex-wrap gap-2">
                {flatCats.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setCategoryIds((ids) => toggle(ids, c.id))
                      }
                      className={[
                        "rounded-full px-2 py-0.5 text-xs",
                        categoryIds.includes(c.id)
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}

          {tags.length > 0 ? (
            <fieldset>
              <legend className="text-sm font-medium text-zinc-700">Tags</legend>
              <ul className="mt-1 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTagIds((ids) => toggle(ids, t.id))}
                      className={[
                        "rounded-full px-2 py-0.5 text-xs",
                        tagIds.includes(t.id)
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {createMutation.isPending ? "Saving…" : "Save idea"}
          </button>
        </div>
      </form>
    </div>
  );
}
