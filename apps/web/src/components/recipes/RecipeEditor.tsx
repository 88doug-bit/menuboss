/**
 * Full recipe create/edit form (§8.1): fields, instruction reorder,
 * ingredient lines, category/tag pickers, leftover decay path.
 * Save via recipe.create / recipe.update.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  recipeCreateInputSchema,
  type InstructionStep,
  type LeftoverDecayPathEntry,
  type RecipeCreateInput,
} from "@menu-boss/schemas";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { LeftoverDecayPath } from "@/components/recipes/LeftoverDecayPath";
import {
  CategoryPicker,
  TagPicker,
} from "@/components/shared/CategoryTagPickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/lib/trpc/client";
import { slugify } from "@/lib/utils";
import { SEED_UNITS } from "@/lib/units";
import { parseInstructions } from "@/components/recipes/InstructionSteps";

import { InstructionStepsEditor } from "./InstructionStepsEditor";
import {
  IngredientLinesEditor,
  linesToPayload,
  validateIngredientLine,
  type CreateIngredientResult,
  type IngredientLineDraft,
  nextLineKey,
} from "./IngredientLinesEditor";

export type RecipeEditorProps = {
  /** Existing recipe id for edit; omit for create. */
  recipeId?: string;
};

type FormValues = {
  title: string;
  description: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  totalTimeMinutes: string;
  yieldServings: string;
  sourceUrl: string;
  sourceBook: string;
  isTemplate: boolean;
};

function optionalInt(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function parseDecay(raw: unknown): LeftoverDecayPathEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LeftoverDecayPathEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.use !== "string" || !o.use.trim()) continue;
    const entry: LeftoverDecayPathEntry = { use: o.use };
    if (typeof o.notes === "string") entry.notes = o.notes;
    if (Array.isArray(o.linkedRecipeIds)) {
      entry.linkedRecipeIds = o.linkedRecipeIds.filter(
        (id): id is string => typeof id === "string",
      );
    }
    out.push(entry);
  }
  return out;
}

export function RecipeEditor({ recipeId }: RecipeEditorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isEdit = Boolean(recipeId);

  const [formError, setFormError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [instructions, setInstructions] = useState<InstructionStep[]>([]);
  const [ingredientLines, setIngredientLines] = useState<IngredientLineDraft[]>(
    [],
  );
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [decayPath, setDecayPath] = useState<LeftoverDecayPathEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  const detailQuery = useQuery({
    ...trpc.recipe.byId.queryOptions({ id: recipeId! }),
    enabled: isEdit,
  });

  const categoriesQuery = useQuery(
    trpc.category.list.queryOptions({ activeOnly: true }),
  );
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));
  // tag.create is admin-only (procedure + RLS) — only offer the inline
  // "new tag" input to admins.
  const meQuery = useQuery(trpc.family.me.queryOptions());
  const isAdmin = meQuery.data?.profile.role === "admin";
  const createTag = useMutation(trpc.tag.create.mutationOptions());

  const searchQueryEnabled = searchQuery.trim().length > 0;
  const ingredientSearch = useQuery({
    ...trpc.ingredient.list.queryOptions({
      q: searchQuery.trim() || undefined,
      limit: 15,
    }),
    enabled: searchQueryEnabled,
  });

  const form = useForm<FormValues>({
    defaultValues: {
      title: "",
      description: "",
      prepTimeMinutes: "",
      cookTimeMinutes: "",
      totalTimeMinutes: "",
      yieldServings: "1",
      sourceUrl: "",
      sourceBook: "",
      isTemplate: false,
    },
  });

  // Hydrate edit form once detail loads.
  useEffect(() => {
    if (!detailQuery.data) return;
    const r = detailQuery.data;
    form.reset({
      title: r.title,
      description: r.description ?? "",
      prepTimeMinutes:
        r.prepTimeMinutes != null ? String(r.prepTimeMinutes) : "",
      cookTimeMinutes:
        r.cookTimeMinutes != null ? String(r.cookTimeMinutes) : "",
      totalTimeMinutes:
        r.totalTimeMinutes != null ? String(r.totalTimeMinutes) : "",
      yieldServings: String(r.yieldServings ?? 1),
      sourceUrl: r.sourceUrl ?? "",
      sourceBook: r.sourceBook ?? "",
      isTemplate: r.isTemplate,
    });
    setInstructions(parseInstructions(r.instructions) as InstructionStep[]);
    setCategoryIds(r.categoryIds ?? []);
    setTagIds(r.tagIds ?? []);
    setDecayPath(parseDecay(r.leftoverDecayPath));

    const lines: IngredientLineDraft[] = [...(r.ingredients ?? [])]
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      .map((ing) => ({
        key: nextLineKey(),
        ingredientId: ing.ingredientId,
        ingredientName: nameMap[ing.ingredientId] ?? "…",
        quantity: ing.quantity,
        unitId: ing.unitId,
        preparationNote: ing.preparationNote ?? "",
        isOptional: ing.isOptional,
      }));
    setIngredientLines(lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per recipe payload
  }, [detailQuery.data]);

  // Resolve ingredient names for hydrated lines.
  const lineIds = useMemo(
    () =>
      [
        ...new Set(
          ingredientLines
            .map((l) => l.ingredientId)
            .filter((id) => id && !nameMap[id]),
        ),
      ],
    [ingredientLines, nameMap],
  );

  const nameQueries = useQuery({
    ...trpc.ingredient.list.queryOptions({ limit: 100 }),
    enabled: lineIds.length > 0 && isEdit,
  });

  useEffect(() => {
    if (!nameQueries.data?.items) return;
    const map: Record<string, string> = {};
    for (const item of nameQueries.data.items) {
      map[item.id] = item.name;
    }
    if (Object.keys(map).length === 0) return;
    setNameMap((prev) => ({ ...prev, ...map }));
    setIngredientLines((prev) =>
      prev.map((l) =>
        map[l.ingredientId] && l.ingredientName === "…"
          ? { ...l, ingredientName: map[l.ingredientId]! }
          : l,
      ),
    );
  }, [nameQueries.data]);

  // Prefer byId for missing names when list page is incomplete.
  useEffect(() => {
    if (!detailQuery.data?.ingredients) return;
    const missing = detailQuery.data.ingredients
      .map((i) => i.ingredientId)
      .filter((id) => !nameMap[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries: Record<string, string> = {};
      for (const id of missing.slice(0, 20)) {
        try {
          const row = await queryClient.fetchQuery(
            trpc.ingredient.byId.queryOptions({ id }),
          );
          if (row?.name) entries[id] = row.name;
        } catch {
          // ignore missing ingredients
        }
      }
      if (cancelled || Object.keys(entries).length === 0) return;
      setNameMap((prev) => ({ ...prev, ...entries }));
      setIngredientLines((prev) =>
        prev.map((l) =>
          entries[l.ingredientId]
            ? { ...l, ingredientName: entries[l.ingredientId]! }
            : l,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [detailQuery.data, nameMap, queryClient, trpc]);

  const createIngredient = useMutation(
    trpc.ingredient.create.mutationOptions(),
  );

  const createRecipe = useMutation(
    trpc.recipe.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(trpc.recipe.list.queryFilter());
        router.push(`/recipes/${created.id}`);
        router.refresh();
      },
      onError: (err) => setFormError(err.message ?? "Create failed"),
    }),
  );

  const updateRecipe = useMutation(
    trpc.recipe.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId! }),
        );
        await queryClient.invalidateQueries(trpc.recipe.list.queryFilter());
        router.push(`/recipes/${recipeId}`);
        router.refresh();
      },
      onError: (err) => setFormError(err.message ?? "Update failed"),
    }),
  );

  async function handleCreateIngredient(input: {
    name: string;
    defaultUnitId: string;
  }): Promise<CreateIngredientResult> {
    try {
      const created = await createIngredient.mutateAsync({
        name: input.name,
        defaultUnitId: input.defaultUnitId,
        isUserAdded: true,
      });
      setNameMap((prev) => ({ ...prev, [created.id]: created.name }));
      return {
        ok: true,
        id: created.id,
        name: created.name,
        defaultUnitId: created.defaultUnitId,
      };
    } catch (err) {
      const e = err as {
        data?: { code?: string };
        message?: string;
        cause?: { existingId?: string; existingName?: string };
      };
      const code = e.data?.code;
      if (code === "CONFLICT") {
        // cause may not serialize; fall back to search by name
        let existingId = e.cause?.existingId ?? "";
        let existingName = e.cause?.existingName ?? input.name;
        if (!existingId) {
          try {
            const listed = await queryClient.fetchQuery(
              trpc.ingredient.list.queryOptions({
                q: input.name,
                limit: 10,
              }),
            );
            const match = listed.items.find(
              (i) => i.name.toLowerCase() === input.name.toLowerCase(),
            );
            if (match) {
              existingId = match.id;
              existingName = match.name;
            }
          } catch {
            // leave empty
          }
        }
        if (existingId) {
          return {
            ok: false,
            conflict: true,
            existingId,
            existingName,
            message:
              e.message ??
              `Ingredient name already exists: "${input.name}"`,
          };
        }
      }
      return {
        ok: false,
        message: e.message ?? "Could not create ingredient",
      };
    }
  }

  function buildPayload(values: FormValues): RecipeCreateInput | null {
    const title = values.title.trim();
    if (!title) {
      setFormError("Title is required");
      return null;
    }

    const cleanedInstructions = instructions
      .map((s) => ({
        text: s.text.trim(),
        timerMinutes: s.timerMinutes,
        temperature: s.temperature?.trim() || undefined,
      }))
      .filter((s) => s.text.length > 0);

    for (const line of ingredientLines) {
      const v = validateIngredientLine(line);
      if (!v.ok) {
        setShowValidation(true);
        setFormError(v.message);
        return null;
      }
    }

    const yieldRaw = Number(values.yieldServings);
    if (!Number.isFinite(yieldRaw) || yieldRaw <= 0) {
      setFormError("Yield servings must be greater than 0");
      return null;
    }

    // Validate top-level with schema defaults
    const candidate = {
      title,
      description: values.description.trim() || undefined,
      instructions: cleanedInstructions,
      prepTimeMinutes: optionalInt(values.prepTimeMinutes),
      cookTimeMinutes: optionalInt(values.cookTimeMinutes),
      totalTimeMinutes: optionalInt(values.totalTimeMinutes),
      yieldServings: yieldRaw,
      sourceUrl: values.sourceUrl.trim() || undefined,
      sourceBook: values.sourceBook.trim() || undefined,
      isTemplate: values.isTemplate,
      leftoverDecayPath: decayPath,
      ingredients: linesToPayload(ingredientLines),
      categoryIds,
      tagIds,
    };

    const parsed = recipeCreateInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Invalid recipe form",
      );
      return null;
    }
    return parsed.data;
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const payload = buildPayload(values);
    if (!payload) return;

    if (isEdit && recipeId) {
      await updateRecipe.mutateAsync({ id: recipeId, ...payload });
    } else {
      await createRecipe.mutateAsync(payload);
    }
  }

  const saving = createRecipe.isPending || updateRecipe.isPending;
  const catTree = categoriesQuery.data?.tree ?? [];
  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];
  const searchResults = (ingredientSearch.data?.items ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    defaultUnitId: i.defaultUnitId,
  }));

  if (isEdit && detailQuery.isLoading) {
    return <p className="p-4 text-sm text-zinc-500">Loading recipe…</p>;
  }

  if (isEdit && (detailQuery.isError || !detailQuery.data)) {
    return (
      <p className="p-4 text-sm text-red-600" role="alert">
        Recipe not found or inaccessible.
      </p>
    );
  }

  if (isEdit && detailQuery.data?.isDeleted) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-950">
          This recipe is soft-deleted. Restore it from the detail page before
          editing.
        </p>
        <Link
          href={`/recipes/${recipeId}`}
          className="text-sm font-medium text-emerald-800 underline"
        >
          Back to detail
        </Link>
      </div>
    );
  }

  return (
    <form
      data-testid="recipe-editor"
      className="mx-auto max-w-2xl space-y-6"
      onSubmit={form.handleSubmit((v) => void onSubmit(v))}
      noValidate
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-900">
          {isEdit ? "Edit recipe" : "New recipe"}
        </h1>
        {isEdit ? (
          <Link
            href={`/recipes/${recipeId}`}
            className="text-sm text-zinc-600 underline"
          >
            Cancel
          </Link>
        ) : (
          <Link href="/recipes" className="text-sm text-zinc-600 underline">
            Cancel
          </Link>
        )}
      </div>

      {formError ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="recipe-form-error"
        >
          {formError}
        </p>
      ) : null}

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div>
          <Label htmlFor="recipe-title">Title</Label>
          <Input
            id="recipe-title"
            data-testid="recipe-title"
            {...form.register("title", { required: true })}
            disabled={saving}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="recipe-description">Description</Label>
          <textarea
            id="recipe-description"
            data-testid="recipe-description"
            rows={3}
            disabled={saving}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            {...form.register("description")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="prep">Prep (min)</Label>
            <Input
              id="prep"
              type="number"
              min={0}
              data-testid="recipe-prep"
              disabled={saving}
              className="mt-1"
              {...form.register("prepTimeMinutes")}
            />
          </div>
          <div>
            <Label htmlFor="cook">Cook (min)</Label>
            <Input
              id="cook"
              type="number"
              min={0}
              data-testid="recipe-cook"
              disabled={saving}
              className="mt-1"
              {...form.register("cookTimeMinutes")}
            />
          </div>
          <div>
            <Label htmlFor="total">Total (min)</Label>
            <Input
              id="total"
              type="number"
              min={0}
              data-testid="recipe-total"
              disabled={saving}
              className="mt-1"
              {...form.register("totalTimeMinutes")}
            />
          </div>
          <div>
            <Label htmlFor="yield">Yield servings</Label>
            <Input
              id="yield"
              type="number"
              min={0}
              step="any"
              data-testid="recipe-yield"
              disabled={saving}
              className="mt-1"
              {...form.register("yieldServings")}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="source-url">Source URL</Label>
            <Input
              id="source-url"
              type="url"
              data-testid="recipe-source-url"
              disabled={saving}
              className="mt-1"
              placeholder="https://…"
              {...form.register("sourceUrl")}
            />
          </div>
          <div>
            <Label htmlFor="source-book">Source book</Label>
            <Input
              id="source-book"
              data-testid="recipe-source-book"
              disabled={saving}
              className="mt-1"
              {...form.register("sourceBook")}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            data-testid="recipe-is-template"
            disabled={saving}
            {...form.register("isTemplate")}
            className="h-3.5 w-3.5 rounded border-zinc-300"
          />
          Save as template
        </label>

        {/* Phase 2 — image upload slot
            <div data-testid="recipe-image-slot">Image upload (deferred)</div>
        */}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <InstructionStepsEditor
          value={instructions}
          onChange={setInstructions}
          disabled={saving}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <IngredientLinesEditor
          value={ingredientLines}
          onChange={setIngredientLines}
          units={SEED_UNITS}
          searchResults={searchResults}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchLoading={ingredientSearch.isFetching}
          onCreateIngredient={handleCreateIngredient}
          createPending={createIngredient.isPending}
          disabled={saving}
          showValidation={showValidation}
        />
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
        <CategoryPicker
          categories={catTree}
          selectedIds={categoryIds}
          onChange={setCategoryIds}
        />
        <TagPicker
          tags={tags}
          selectedIds={tagIds}
          onChange={setTagIds}
          onCreate={
            isAdmin
              ? async (name, tagGroup) => {
                  const tag = await createTag.mutateAsync({
                    name,
                    slug: slugify(name),
                    tagGroup,
                  });
                  await queryClient.invalidateQueries(
                    trpc.tag.list.queryFilter(),
                  );
                  return tag;
                }
              : undefined
          }
        />
      </div>

      <LeftoverDecayPath
        entries={decayPath}
        onSave={(next) => {
          setDecayPath(next as LeftoverDecayPathEntry[]);
        }}
        saving={false}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          data-testid="recipe-save"
          disabled={saving}
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create recipe"}
        </Button>
      </div>
    </form>
  );
}
