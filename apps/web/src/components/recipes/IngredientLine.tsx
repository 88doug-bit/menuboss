/**
 * Recipe ingredient row with optional inline safety callout.
 */
import {
  SafetyNoteCallout,
  hasMercuryProfile,
} from "./SafetyNoteCallout";

export type IngredientLineProps = {
  name: string;
  quantity?: number | null;
  unitLabel?: string | null;
  preparationNote?: string | null;
  isOptional?: boolean;
  foodSafetyProfile?: unknown;
};

export function IngredientLine({
  name,
  quantity,
  unitLabel,
  preparationNote,
  isOptional,
  foodSafetyProfile,
}: IngredientLineProps) {
  const qty =
    quantity != null
      ? `${quantity}${unitLabel ? ` ${unitLabel}` : ""}`
      : null;

  return (
    <li data-testid="ingredient-line" className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {qty ? (
          <span className="font-medium tabular-nums text-zinc-900">{qty}</span>
        ) : null}
        <span className="text-zinc-800">
          {name}
          {isOptional ? (
            <span className="ml-1 text-xs text-zinc-500">(optional)</span>
          ) : null}
        </span>
        {preparationNote ? (
          <span className="text-sm text-zinc-500">— {preparationNote}</span>
        ) : null}
      </div>
      {hasMercuryProfile(foodSafetyProfile) ? (
        <SafetyNoteCallout mercury={foodSafetyProfile.mercury} />
      ) : null}
    </li>
  );
}
