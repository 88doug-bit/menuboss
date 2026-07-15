/**
 * Portion category editor — name, base oz, sort order, active toggle.
 * Deactivate only (no hard delete). Adult Male 6.0 oz is the D17 reference.
 */
"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { parseBaseProteinOz, slugifyName } from "./adminValidation";

export type PortionCategoryRow = {
  id: string;
  name: string;
  slug: string;
  baseProteinOz: number;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function PortionCategoriesPanel({
  categories,
  onUpdate,
  onCreate,
  onSetActive,
  isSaving = false,
}: {
  categories: PortionCategoryRow[];
  onUpdate: (input: {
    id: string;
    name?: string;
    baseProteinOz?: number;
    sortOrder?: number;
  }) => void;
  onCreate: (input: {
    name: string;
    slug: string;
    baseProteinOz: number;
    sortOrder: number;
  }) => void;
  onSetActive: (id: string, isActive: boolean) => void;
  isSaving?: boolean;
}) {
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; baseOz: string; sortOrder: string }>
  >({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newBaseOz, setNewBaseOz] = useState("6");
  const [createError, setCreateError] = useState<string | null>(null);

  function draftFor(c: PortionCategoryRow) {
    return (
      drafts[c.id] ?? {
        name: c.name,
        baseOz: String(c.baseProteinOz),
        sortOrder: String(c.sortOrder),
      }
    );
  }

  function setDraft(
    id: string,
    patch: Partial<{ name: string; baseOz: string; sortOrder: string }>,
  ) {
    setDrafts((prev) => {
      const base =
        prev[id] ??
        (() => {
          const c = categories.find((x) => x.id === id)!;
          return {
            name: c.name,
            baseOz: String(c.baseProteinOz),
            sortOrder: String(c.sortOrder),
          };
        })();
      return { ...prev, [id]: { ...base, ...patch } };
    });
  }

  function saveRow(c: PortionCategoryRow) {
    const d = draftFor(c);
    const parsed = parseBaseProteinOz(d.baseOz);
    if (!parsed.ok) {
      setRowError((e) => ({ ...e, [c.id]: parsed.message }));
      return;
    }
    setRowError((e) => {
      const next = { ...e };
      delete next[c.id];
      return next;
    });
    onUpdate({
      id: c.id,
      name: d.name.trim(),
      baseProteinOz: parsed.value,
      sortOrder: Number.parseInt(d.sortOrder, 10) || 0,
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const name = newName.trim();
    if (!name) {
      setCreateError("Name is required");
      return;
    }
    const parsed = parseBaseProteinOz(newBaseOz);
    if (!parsed.ok) {
      setCreateError(parsed.message);
      return;
    }
    const slug = slugifyName(name);
    if (!slug) {
      setCreateError("Could not derive slug from name");
      return;
    }
    const maxSort = categories.reduce((m, c) => Math.max(m, c.sortOrder), 0);
    onCreate({
      name,
      slug,
      baseProteinOz: parsed.value,
      sortOrder: maxSort + 10,
    });
    setNewName("");
    setNewBaseOz("6");
  }

  return (
    <div className="space-y-4" data-testid="portion-categories-panel">
      <p className="text-sm text-zinc-600" data-testid="adult-male-hint">
        <strong>Adult Male</strong> is the family reference base (decision D17).
        Default is <strong>6.0 oz</strong> — edit that row to change the
        reference. Other categories carry their own base ounces. Deactivate
        categories you no longer want on new plans; never hard-delete.
      </p>

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Base oz</th>
              <th className="px-3 py-2">Sort</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const d = draftFor(c);
              const isRef = c.slug === "adult-male";
              return (
                <tr
                  key={c.id}
                  className="border-t border-zinc-100"
                  data-testid={`portion-row-${c.slug}`}
                >
                  <td className="px-3 py-2">
                    <Input
                      value={d.name}
                      onChange={(e) =>
                        setDraft(c.id, { name: e.target.value })
                      }
                      data-testid={`portion-name-${c.slug}`}
                      className="h-9"
                    />
                    {isRef && (
                      <Badge className="mt-1 bg-emerald-50 text-emerald-800">
                        D17 reference
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={d.baseOz}
                      onChange={(e) =>
                        setDraft(c.id, { baseOz: e.target.value })
                      }
                      data-testid={`portion-base-oz-${c.slug}`}
                      className="h-9 w-24"
                    />
                    {rowError[c.id] && (
                      <p
                        className="mt-1 text-xs text-red-600"
                        data-testid={`portion-error-${c.slug}`}
                      >
                        {rowError[c.id]}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={d.sortOrder}
                      onChange={(e) =>
                        setDraft(c.id, { sortOrder: e.target.value })
                      }
                      data-testid={`portion-sort-${c.slug}`}
                      className="h-9 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {c.isActive ? (
                      <Badge className="bg-emerald-50 text-emerald-800">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-zinc-200 text-zinc-600">
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSaving}
                        onClick={() => saveRow(c)}
                        data-testid={`portion-save-${c.slug}`}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSaving}
                        onClick={() => onSetActive(c.id, !c.isActive)}
                        data-testid={`portion-toggle-${c.slug}`}
                      >
                        {c.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-zinc-300 p-3"
        data-testid="portion-create-form"
      >
        <div>
          <label className="text-xs font-medium text-zinc-600">New name</label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            data-testid="portion-new-name"
            className="mt-1 h-9 w-40"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600">Base oz</label>
          <Input
            type="number"
            step="0.1"
            value={newBaseOz}
            onChange={(e) => setNewBaseOz(e.target.value)}
            data-testid="portion-new-base-oz"
            className="mt-1 h-9 w-24"
          />
        </div>
        <Button type="submit" size="sm" disabled={isSaving}>
          Add category
        </Button>
        {createError && (
          <p
            className="w-full text-sm text-red-600"
            role="alert"
            data-testid="portion-create-error"
          >
            {createError}
          </p>
        )}
      </form>
    </div>
  );
}
