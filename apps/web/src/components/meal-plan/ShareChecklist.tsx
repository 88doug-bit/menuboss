"use client";

/**
 * Household sharing checklist.
 * Creating household is always checked + disabled (irremovable).
 */
import { cn } from "@/lib/utils";

export type HouseholdOption = {
  id: string;
  name: string;
  isActive?: boolean;
};

export type ShareChecklistProps = {
  households: HouseholdOption[];
  /** Creating household id — always included, checkbox disabled. */
  creatorHouseholdId: string;
  value: string[];
  onChange: (householdIds: string[]) => void;
  disabled?: boolean;
  className?: string;
};

export function ShareChecklist({
  households,
  creatorHouseholdId,
  value,
  onChange,
  disabled = false,
  className,
}: ShareChecklistProps) {
  const selected = new Set(value);

  // Creator always present in selection for display consistency.
  if (!selected.has(creatorHouseholdId)) {
    selected.add(creatorHouseholdId);
  }

  function toggle(id: string, checked: boolean) {
    if (disabled || id === creatorHouseholdId) return;
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    // Creator is always retained.
    next.add(creatorHouseholdId);
    onChange([...next]);
  }

  return (
    <fieldset
      className={cn("flex flex-col gap-2", className)}
      data-testid="share-checklist"
    >
      <legend className="text-sm font-medium text-zinc-800">
        Share with households
      </legend>
      <p className="text-xs text-zinc-500">
        Your household is always included and cannot be removed.
      </p>
      <ul className="flex flex-col gap-2">
        {households.map((h) => {
          const isCreator = h.id === creatorHouseholdId;
          const isChecked = selected.has(h.id);
          return (
            <li key={h.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm",
                  isCreator && "bg-zinc-50",
                  disabled && "cursor-not-allowed opacity-60",
                )}
                data-testid={
                  isCreator
                    ? "share-row-creator"
                    : `share-row-${h.id}`
                }
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
                  checked={isChecked}
                  disabled={disabled || isCreator}
                  onChange={(e) => toggle(h.id, e.target.checked)}
                  data-testid={
                    isCreator
                      ? "share-checkbox-creator"
                      : `share-checkbox-${h.id}`
                  }
                />
                <span className="font-medium text-zinc-900">{h.name}</span>
                {isCreator && (
                  <span className="text-xs text-zinc-500">(your household)</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
