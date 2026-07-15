/**
 * Family settings — athlete multiplier with live portion-calc example.
 * Math is delegated to @menu-boss/portion-calc (never inlined).
 */
"use client";

import {
  calculatePerCategoryBreakdown,
  roundOz,
} from "@menu-boss/portion-calc";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ADULT_MALE_ID = "adult-male-ref";
const ADULT_MALE_BASE = 6;

export function FamilySettingsPanel({
  settingsId,
  athleteMultiplier,
  onSave,
  isSaving = false,
}: {
  settingsId: string;
  athleteMultiplier: number;
  onSave: (input: { id: string; athleteMultiplier: number }) => void;
  isSaving?: boolean;
}) {
  const [value, setValue] = useState(String(athleteMultiplier));

  const exampleOz = useMemo(() => {
    const mult = Number(value);
    if (!Number.isFinite(mult) || mult <= 0) return null;
    try {
      const lines = calculatePerCategoryBreakdown(
        [
          {
            portionCategoryId: ADULT_MALE_ID,
            count: 1,
            athleteCount: 1,
          },
        ],
        [
          {
            id: ADULT_MALE_ID,
            slug: "adult-male",
            baseProteinOz: ADULT_MALE_BASE,
            isActive: true,
          },
        ],
        { athleteMultiplier: mult },
      );
      return lines[0]?.effectiveOz ?? null;
    } catch {
      return null;
    }
  }, [value]);

  function handleSave() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || !settingsId) return;
    onSave({ id: settingsId, athleteMultiplier: n });
  }

  function step(delta: number) {
    const n = Number(value);
    const next = Number.isFinite(n) ? Math.max(0.1, Math.round((n + delta) * 10) / 10) : 1.5;
    setValue(String(next));
  }

  return (
    <div className="space-y-4" data-testid="family-settings-panel">
      <p className="text-sm text-zinc-600">
        Family-wide athlete multiplier applied when a person in a portion
        category is marked as an athlete. Base ounces still live on each
        PortionCategory (Adult Male default 6.0 oz).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-zinc-800" htmlFor="athlete-mult">
          Athlete multiplier
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => step(-0.1)}
          aria-label="Decrease multiplier"
          data-testid="athlete-mult-dec"
        >
          −
        </Button>
        <Input
          id="athlete-mult"
          type="number"
          step="0.1"
          min="0.1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 w-24"
          data-testid="athlete-multiplier-input"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => step(0.1)}
          aria-label="Increase multiplier"
          data-testid="athlete-mult-inc"
        >
          +
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !settingsId}
          data-testid="athlete-mult-save"
        >
          Save
        </Button>
      </div>

      <p
        className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        data-testid="athlete-example"
      >
        {exampleOz != null ? (
          <>
            An athlete adult male counts as{" "}
            <strong>{roundOz(exampleOz).toFixed(1)} oz</strong> at{" "}
            <strong>{Number(value)}×</strong> (base {ADULT_MALE_BASE}.0 oz ×
            multiplier).
          </>
        ) : (
          <>Enter a positive multiplier to see the live example.</>
        )}
      </p>
    </div>
  );
}
