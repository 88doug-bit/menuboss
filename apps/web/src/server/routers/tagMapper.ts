/**
 * Explicit snake_case ↔ camelCase mapping for tag domain.
 */

export type TagRow = {
  id: string;
  name: string;
  slug: string;
  tag_group: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TagDto = {
  id: string;
  name: string;
  slug: string;
  tagGroup: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function mapTagRow(row: TagRow): TagDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagGroup: row.tag_group,
    description: row.description,
    color: row.color,
    icon: row.icon,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function tagWriteFields(input: {
  name?: string;
  slug?: string;
  tagGroup?: string;
  description?: string;
  isActive?: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.slug !== undefined) out.slug = input.slug;
  if (input.tagGroup !== undefined) out.tag_group = input.tagGroup;
  if (input.description !== undefined) out.description = input.description;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}
