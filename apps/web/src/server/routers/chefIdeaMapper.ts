/**
 * Explicit snake_case ↔ camelCase mapping for chef_idea domain.
 * API `convertedRecipeId` ↔ DB `linked_recipe_id`.
 */

export type ChefIdeaRow = {
  id: string;
  title: string;
  notes: string | null;
  source: string | null;
  status: string;
  priority: number | null;
  linked_recipe_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ChefIdeaDto = {
  id: string;
  title: string;
  notes: string | null;
  source: string | null;
  status: string;
  priority: number | null;
  convertedRecipeId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
};

export function mapChefIdeaRow(row: ChefIdeaRow): ChefIdeaDto {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    source: row.source,
    status: row.status,
    priority: row.priority,
    convertedRecipeId: row.linked_recipe_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function chefIdeaWriteFields(input: {
  title?: string;
  notes?: string;
  source?: string;
  status?: string;
  priority?: number;
  convertedRecipeId?: string | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.notes !== undefined) out.notes = input.notes;
  if (input.source !== undefined) out.source = input.source;
  if (input.status !== undefined) out.status = input.status;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.convertedRecipeId !== undefined)
    out.linked_recipe_id = input.convertedRecipeId;
  return out;
}
