/**
 * Expandable Creative Leftovers section (§9.2) with inline add/edit.
 * Pure presentational + local form state; parent persists via setLeftoverDecayPath.
 */
"use client";

import Link from "next/link";
import { useState } from "react";

export type DecayPathEntry = {
  use: string;
  notes?: string;
  linkedRecipeIds?: string[];
};

export function LeftoverDecayPath({
  entries,
  onSave,
  saving = false,
  recipeTitles = {},
}: {
  entries: DecayPathEntry[];
  onSave: (next: DecayPathEntry[]) => void | Promise<void>;
  saving?: boolean;
  /** Optional map recipeId → title for linked chips. */
  recipeTitles?: Record<string, string>;
}) {
  const [open, setOpen] = useState(entries.length > 0);
  const [draftUse, setDraftUse] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);

  async function commitAdd() {
    const use = draftUse.trim();
    if (!use) return;
    const next: DecayPathEntry[] = [
      ...entries,
      {
        use,
        notes: draftNotes.trim() || undefined,
      },
    ];
    await onSave(next);
    setDraftUse("");
    setDraftNotes("");
  }

  async function commitEdit(index: number) {
    const use = draftUse.trim();
    if (!use) return;
    const next = entries.map((e, i) =>
      i === index
        ? {
            ...e,
            use,
            notes: draftNotes.trim() || undefined,
          }
        : e,
    );
    await onSave(next);
    setEditIndex(null);
    setDraftUse("");
    setDraftNotes("");
  }

  async function removeAt(index: number) {
    await onSave(entries.filter((_, i) => i !== index));
  }

  function startEdit(index: number) {
    const e = entries[index]!;
    setEditIndex(index);
    setDraftUse(e.use);
    setDraftNotes(e.notes ?? "");
    setOpen(true);
  }

  return (
    <section
      data-testid="leftover-decay-path"
      className="rounded-xl border border-zinc-200 bg-white"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-semibold text-zinc-900">Creative Leftovers</span>
        <span className="text-sm text-zinc-500">
          {entries.length} idea{entries.length === 1 ? "" : "s"} ·{" "}
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-zinc-100 px-4 py-3">
          {entries.length === 0 ? (
            <p className="mb-3 text-sm text-zinc-600">
              No leftover ideas yet — capture how this dish becomes tomorrow&apos;s
              meal.
            </p>
          ) : (
            <ul className="mb-4 space-y-3">
              {entries.map((entry, index) => (
                <li
                  key={`${entry.use}-${index}`}
                  data-testid={`decay-entry-${index}`}
                  className="rounded-lg bg-zinc-50 px-3 py-2"
                >
                  {editIndex === index ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-zinc-600">
                        Use
                        <input
                          data-testid="decay-edit-use"
                          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                          value={draftUse}
                          onChange={(e) => setDraftUse(e.target.value)}
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-600">
                        Notes
                        <input
                          data-testid="decay-edit-notes"
                          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-testid="decay-save-edit"
                          disabled={saving}
                          className="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                          onClick={() => void commitEdit(index)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="rounded border border-zinc-300 px-3 py-1 text-sm"
                          onClick={() => {
                            setEditIndex(null);
                            setDraftUse("");
                            setDraftNotes("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-900">{entry.use}</p>
                          {entry.notes ? (
                            <p className="mt-0.5 text-sm text-zinc-600">
                              {entry.notes}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            data-testid={`decay-edit-${index}`}
                            className="text-xs text-emerald-700 underline"
                            onClick={() => startEdit(index)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            data-testid={`decay-remove-${index}`}
                            className="text-xs text-red-700 underline"
                            disabled={saving}
                            onClick={() => void removeAt(index)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {entry.linkedRecipeIds?.length ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {entry.linkedRecipeIds.map((id) => (
                            <li key={id}>
                              <Link
                                href={`/recipes/${id}`}
                                className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                              >
                                {recipeTitles[id] ?? "Linked recipe"}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {editIndex === null ? (
            <div
              data-testid="decay-add-form"
              className="space-y-2 rounded-lg border border-dashed border-zinc-300 p-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Add leftover idea
              </p>
              <label className="block text-xs font-medium text-zinc-600">
                Use
                <input
                  data-testid="decay-add-use"
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                  placeholder="e.g. Cuban sandwiches"
                  value={draftUse}
                  onChange={(e) => setDraftUse(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600">
                Notes
                <input
                  data-testid="decay-add-notes"
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                  placeholder="Optional notes"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                />
              </label>
              <button
                type="button"
                data-testid="decay-add-submit"
                disabled={saving || !draftUse.trim()}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void commitAdd()}
              >
                Add idea
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
