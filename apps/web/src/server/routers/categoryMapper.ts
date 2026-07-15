/**
 * Explicit snake_case ↔ camelCase mapping for category domain.
 */

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  category_type: string;
  sort_order: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryDto = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  categoryType: string;
  sortOrder: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  children?: CategoryDto[];
};

export function mapCategoryRow(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id,
    categoryType: row.category_type,
    sortOrder: row.sort_order,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function categoryWriteFields(input: {
  name?: string;
  slug?: string;
  parentId?: string | null;
  categoryType?: string;
  sortOrder?: number;
  description?: string;
  isActive?: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.slug !== undefined) out.slug = input.slug;
  if (input.parentId !== undefined) out.parent_id = input.parentId;
  if (input.categoryType !== undefined) out.category_type = input.categoryType;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.description !== undefined) out.description = input.description;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

/** Assemble a forest from flat parent_id rows (stable sort_order). */
export function buildCategoryTree(rows: CategoryRow[]): CategoryDto[] {
  const nodes = new Map<string, CategoryDto>();
  for (const row of rows) {
    nodes.set(row.id, { ...mapCategoryRow(row), children: [] });
  }
  const roots: CategoryDto[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    if (row.parent_id && nodes.has(row.parent_id)) {
      nodes.get(row.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: CategoryDto[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const n of list) {
      if (n.children?.length) sortRec(n.children);
    }
  };
  sortRec(roots);
  return roots;
}
