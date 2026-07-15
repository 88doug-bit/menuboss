/**
 * Ingredient manager list + edit drawer (/recipes/ingredients).
 * Food-safety profile editor is admin-gated (family.me.role).
 */
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FoodSafetyProfile } from "@menu-boss/schemas";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/lib/trpc/client";
import {
  DEFAULT_UNIT_ID,
  SEED_UNITS,
  unitLabel,
  unitsByDimension,
} from "@/lib/units";

import { FoodSafetyProfileEditor } from "./FoodSafetyProfileEditor";

type DrawerMode = "closed" | "edit" | "create";

type SelectedIngredient = {
  id: string;
  name: string;
  description: string | null;
  defaultUnitId: string | null;
  nutritionData: unknown;
  foodSafetyProfile: unknown;
  isUserAdded: boolean;
};

export function IngredientManager() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [userAddedOnly, setUserAddedOnly] = useState(false);
  const [drawer, setDrawer] = useState<DrawerMode>("closed");
  const [selected, setSelected] = useState<SelectedIngredient | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultUnitId, setDefaultUnitId] = useState(DEFAULT_UNIT_ID);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [nutritionJson, setNutritionJson] = useState("");
  const [safetyProfile, setSafetyProfile] = useState<FoodSafetyProfile>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [mergeHint, setMergeHint] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const meQuery = useQuery(trpc.family.me.queryOptions());
  const isAdmin = meQuery.data?.profile.role === "admin";

  const listQuery = useQuery(
    trpc.ingredient.list.queryOptions({
      q: q.trim() || undefined,
      limit: 50,
    }),
  );

  const items = useMemo(() => {
    const raw = listQuery.data?.items ?? [];
    if (!userAddedOnly) return raw;
    return raw.filter((i) => i.isUserAdded);
  }, [listQuery.data, userAddedOnly]);

  const grouped = unitsByDimension(SEED_UNITS);

  function openCreate() {
    setSelected(null);
    setName("");
    setDescription("");
    setDefaultUnitId(DEFAULT_UNIT_ID);
    setNutritionJson("");
    setSafetyProfile({});
    setAdvancedOpen(false);
    setFormError(null);
    setMergeHint(null);
    setDrawer("create");
  }

  function openEdit(ing: SelectedIngredient) {
    setSelected(ing);
    setName(ing.name);
    setDescription(ing.description ?? "");
    setDefaultUnitId(ing.defaultUnitId ?? DEFAULT_UNIT_ID);
    setNutritionJson(
      ing.nutritionData != null
        ? JSON.stringify(ing.nutritionData, null, 2)
        : "",
    );
    setSafetyProfile(
      (ing.foodSafetyProfile as FoodSafetyProfile | null) ?? {},
    );
    setAdvancedOpen(false);
    setFormError(null);
    setMergeHint(null);
    setDrawer("edit");
  }

  function closeDrawer() {
    setDrawer("closed");
    setSelected(null);
    setFormError(null);
    setMergeHint(null);
  }

  const createMutation = useMutation(
    trpc.ingredient.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.ingredient.list.queryFilter());
        closeDrawer();
      },
      onError: async (err) => {
        const code = err.data?.code;
        if (code === "CONFLICT") {
          setFormError(err.message);
          try {
            const listed = await queryClient.fetchQuery(
              trpc.ingredient.list.queryOptions({
                q: name.trim(),
                limit: 10,
              }),
            );
            const match = listed.items.find(
              (i) => i.name.toLowerCase() === name.trim().toLowerCase(),
            );
            if (match) {
              setMergeHint({ id: match.id, name: match.name });
            }
          } catch {
            // ignore
          }
          return;
        }
        setFormError(err.message ?? "Create failed");
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.ingredient.update.mutationOptions({
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries(trpc.ingredient.list.queryFilter());
        await queryClient.invalidateQueries(
          trpc.ingredient.byId.queryFilter({ id: updated.id }),
        );
        // Keep drawer open with refreshed fields if still editing
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                name: updated.name,
                description: updated.description,
                defaultUnitId: updated.defaultUnitId,
              }
            : prev,
        );
        setFormError(null);
      },
      onError: (err) => setFormError(err.message ?? "Update failed"),
    }),
  );

  const safetyMutation = useMutation(
    trpc.ingredient.setFoodSafetyProfile.mutationOptions({
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries(trpc.ingredient.list.queryFilter());
        await queryClient.invalidateQueries(
          trpc.ingredient.byId.queryFilter({ id: updated.id }),
        );
        setSafetyProfile(
          (updated.foodSafetyProfile as FoodSafetyProfile) ?? {},
        );
        setFormError(null);
      },
      onError: (err) => {
        const code = err.data?.code;
        if (code === "FORBIDDEN") {
          setFormError("Only family admins can edit food-safety profiles.");
        } else {
          setFormError(err.message ?? "Safety profile save failed");
        }
      },
    }),
  );

  const softDeleteMutation = useMutation(
    trpc.ingredient.softDelete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.ingredient.list.queryFilter());
        closeDrawer();
      },
      onError: (err) => setFormError(err.message ?? "Delete failed"),
    }),
  );

  async function saveCore() {
    setFormError(null);
    setMergeHint(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required");
      return;
    }

    // <!-- TODO(coordinator): nutrition_data not on ingredient.create/update schemas —
    // advanced textarea is display-only until Wave/admin schema extends write path. -->
    if (drawer === "create") {
      await createMutation.mutateAsync({
        name: trimmed,
        description: description.trim() || undefined,
        defaultUnitId: defaultUnitId || undefined,
        isUserAdded: true,
      });
      return;
    }

    if (drawer === "edit" && selected) {
      await updateMutation.mutateAsync({
        id: selected.id,
        name: trimmed,
        description: description.trim() || undefined,
        defaultUnitId: defaultUnitId || null,
      });
    }
  }

  async function saveSafety() {
    if (!selected || !isAdmin) return;
    setFormError(null);
    await safetyMutation.mutateAsync({
      id: selected.id,
      foodSafetyProfile: safetyProfile,
    });
  }

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    safetyMutation.isPending ||
    softDeleteMutation.isPending;

  return (
    <div data-testid="ingredient-manager" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Ingredients</h1>
          <p className="text-sm text-zinc-500">
            Family-global catalog ·{" "}
            <Link href="/recipes" className="underline">
              Back to recipes
            </Link>
          </p>
        </div>
        <Button
          type="button"
          data-testid="ingredient-new"
          onClick={openCreate}
        >
          New ingredient
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Search ingredients</span>
          <Input
            type="search"
            data-testid="ingredient-manager-search"
            placeholder="Search ingredients…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            data-testid="ingredient-user-added-filter"
            checked={userAddedOnly}
            onChange={(e) => setUserAddedOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300"
          />
          User-added only
          {/* <!-- TODO(coordinator): server-side isUserAdded filter on ingredient.list --> */}
        </label>
      </div>

      {listQuery.isLoading ? (
        <p className="text-sm text-zinc-500">Loading ingredients…</p>
      ) : null}
      {listQuery.isError ? (
        <p className="text-sm text-red-600" role="alert">
          Could not load ingredients.
        </p>
      ) : null}

      <ul
        data-testid="ingredient-list"
        className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white"
      >
        {items.length === 0 && !listQuery.isLoading ? (
          <li className="px-4 py-6 text-sm text-zinc-500">
            No ingredients match.
          </li>
        ) : (
          items.map((ing) => (
            <li key={ing.id}>
              <button
                type="button"
                data-testid={`ingredient-row-${ing.id}`}
                onClick={() =>
                  openEdit({
                    id: ing.id,
                    name: ing.name,
                    description: ing.description,
                    defaultUnitId: ing.defaultUnitId,
                    nutritionData: ing.nutritionData,
                    foodSafetyProfile: ing.foodSafetyProfile,
                    isUserAdded: ing.isUserAdded,
                  })
                }
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-50"
              >
                <div>
                  <p className="font-medium text-zinc-900">{ing.name}</p>
                  {ing.description ? (
                    <p className="line-clamp-1 text-xs text-zinc-500">
                      {ing.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {ing.isUserAdded ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
                      User
                    </span>
                  ) : null}
                  {ing.foodSafetyProfile &&
                  typeof ing.foodSafetyProfile === "object" &&
                  Object.keys(ing.foodSafetyProfile as object).length > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                      Safety
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          ))
        )}
      </ul>

      {drawer !== "closed" ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/30"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
          <aside
            data-testid="ingredient-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={
              drawer === "create" ? "Create ingredient" : "Edit ingredient"
            }
            className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h2 className="font-semibold text-zinc-900">
                {drawer === "create" ? "New ingredient" : "Edit ingredient"}
              </h2>
              <button
                type="button"
                data-testid="ingredient-drawer-close"
                onClick={closeDrawer}
                className="text-sm text-zinc-600 underline"
              >
                Close
              </button>
            </div>

            <div className="flex-1 space-y-4 p-4">
              {formError ? (
                <p
                  className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  role="alert"
                  data-testid="ingredient-drawer-error"
                >
                  {formError}
                </p>
              ) : null}

              {mergeHint ? (
                <div
                  data-testid="ingredient-drawer-merge"
                  className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm"
                >
                  <p>
                    Use existing <strong>{mergeHint.name}</strong>?
                  </p>
                  <button
                    type="button"
                    data-testid="ingredient-drawer-merge-accept"
                    className="rounded bg-amber-700 px-3 py-1.5 text-white"
                    onClick={() => {
                      const match = items.find((i) => i.id === mergeHint.id);
                      if (match) {
                        openEdit({
                          id: match.id,
                          name: match.name,
                          description: match.description,
                          defaultUnitId: match.defaultUnitId,
                          nutritionData: match.nutritionData,
                          foodSafetyProfile: match.foodSafetyProfile,
                          isUserAdded: match.isUserAdded,
                        });
                      } else {
                        // fetch full row
                        void queryClient
                          .fetchQuery(
                            trpc.ingredient.byId.queryOptions({
                              id: mergeHint.id,
                            }),
                          )
                          .then((row) => {
                            openEdit({
                              id: row.id,
                              name: row.name,
                              description: row.description,
                              defaultUnitId: row.defaultUnitId,
                              nutritionData: row.nutritionData,
                              foodSafetyProfile: row.foodSafetyProfile,
                              isUserAdded: row.isUserAdded,
                            });
                          });
                      }
                    }}
                  >
                    Open existing
                  </button>
                </div>
              ) : null}

              <div>
                <Label htmlFor="ing-name">Name</Label>
                <Input
                  id="ing-name"
                  data-testid="ingredient-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ing-desc">Description</Label>
                <textarea
                  id="ing-desc"
                  data-testid="ingredient-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="ing-unit">Default unit</Label>
                <select
                  id="ing-unit"
                  data-testid="ingredient-default-unit"
                  value={defaultUnitId}
                  onChange={(e) => setDefaultUnitId(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
                >
                  {grouped.map((g) => (
                    <optgroup
                      key={g.dimension}
                      label={g.dimension.toUpperCase()}
                    >
                      {g.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {unitLabel(u)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <details
                open={advancedOpen}
                onToggle={(e) =>
                  setAdvancedOpen((e.target as HTMLDetailsElement).open)
                }
              >
                <summary
                  data-testid="ingredient-advanced-toggle"
                  className="cursor-pointer text-sm font-medium text-zinc-800"
                >
                  Advanced — nutrition JSON
                </summary>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-zinc-500">
                    Phase 2 structured nutrition. Write path not on
                    ingredient.update yet — shown for reference.
                  </p>
                  <textarea
                    data-testid="ingredient-nutrition-json"
                    rows={5}
                    value={nutritionJson}
                    onChange={(e) => setNutritionJson(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-xs"
                    placeholder="{}"
                  />
                </div>
              </details>

              {drawer === "edit" && selected ? (
                <div className="space-y-2 border-t border-zinc-100 pt-4">
                  <FoodSafetyProfileEditor
                    value={safetyProfile}
                    onChange={setSafetyProfile}
                    isAdmin={isAdmin}
                    disabled={busy}
                  />
                  {isAdmin ? (
                    <Button
                      type="button"
                      data-testid="ingredient-save-safety"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void saveSafety()}
                    >
                      {safetyMutation.isPending
                        ? "Saving safety…"
                        : "Save food-safety profile"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-zinc-200 p-4">
              <Button
                type="button"
                data-testid="ingredient-save"
                disabled={busy}
                onClick={() => void saveCore()}
              >
                {busy && !safetyMutation.isPending
                  ? "Saving…"
                  : drawer === "create"
                    ? "Create"
                    : "Save"}
              </Button>
              {drawer === "edit" && selected ? (
                <Button
                  type="button"
                  variant="destructive"
                  data-testid="ingredient-soft-delete"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Soft-delete “${selected.name}”? Recipes that reference it will show a deleted-ingredient badge.`,
                      )
                    ) {
                      void softDeleteMutation.mutateAsync({ id: selected.id });
                    }
                  }}
                >
                  Soft-delete
                </Button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
