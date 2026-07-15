/**
 * Food-safety profile editor — admin-gated writes (§8.1 / setFoodSafetyProfile).
 * Non-admins see a read-only summary; the structured editor is hidden.
 */
"use client";

import { useState } from "react";
import type {
  ContaminantProfile,
  FoodSafetyProfile,
} from "@menu-boss/schemas";

import { SafetyNoteCallout, hasMercuryProfile } from "./SafetyNoteCallout";

const FDA_CATEGORIES = [
  { value: "Best Choices", label: "Best Choices" },
  { value: "Good Choices", label: "Good Choices" },
  { value: "Choices to Avoid", label: "Choices to Avoid / Avoid" },
] as const;

export type FoodSafetyProfileEditorProps = {
  value: FoodSafetyProfile | null | undefined;
  onChange?: (next: FoodSafetyProfile) => void;
  /** When false, hide the editable form; show read-only only. */
  isAdmin: boolean;
  disabled?: boolean;
};

/** Loose editable shape — Zod catchall makes FoodSafetyProfile awkward to spread. */
type SafetyDraft = {
  mercury?: ContaminantProfile;
  general?: Record<string, unknown>;
  [key: string]: ContaminantProfile | Record<string, unknown> | undefined;
};

function asProfile(value: FoodSafetyProfile | null | undefined): SafetyDraft {
  if (!value || typeof value !== "object") return {};
  return value as SafetyDraft;
}

function contaminantEntries(
  profile: SafetyDraft,
): Array<{ key: string; profile: ContaminantProfile }> {
  const out: Array<{ key: string; profile: ContaminantProfile }> = [];
  for (const [key, val] of Object.entries(profile)) {
    if (key === "general") continue;
    if (val && typeof val === "object") {
      out.push({ key, profile: val as ContaminantProfile });
    }
  }
  return out;
}

function toFoodSafetyProfile(draft: SafetyDraft): FoodSafetyProfile {
  return draft as FoodSafetyProfile;
}

function ReadOnlySafety({ profile }: { profile: SafetyDraft }) {
  const entries = contaminantEntries(profile);
  if (entries.length === 0 && !profile.general) {
    return (
      <p className="text-sm text-zinc-500" data-testid="safety-readonly-empty">
        No food-safety profile on file.
      </p>
    );
  }
  return (
    <div data-testid="safety-readonly" className="space-y-2">
      {hasMercuryProfile(profile) ? (
        <SafetyNoteCallout mercury={profile.mercury!} />
      ) : null}
      {entries
        .filter((e) => e.key !== "mercury")
        .map(({ key, profile: c }) => (
          <div
            key={key}
            className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
          >
            <p className="font-semibold capitalize text-zinc-900">{key}</p>
            <ul className="mt-1 list-inside list-disc text-zinc-700">
              {c.fda_category ? <li>FDA: {c.fda_category}</li> : null}
              {c.risk_level ? <li>Risk: {c.risk_level}</li> : null}
              {c.recommended_frequency ? (
                <li>Frequency: {c.recommended_frequency}</li>
              ) : null}
              {c.notes ? <li>{c.notes}</li> : null}
              {c.source ? <li>Source: {c.source}</li> : null}
              {c.last_reviewed ? <li>Reviewed: {c.last_reviewed}</li> : null}
            </ul>
          </div>
        ))}
      {profile.general ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <p className="font-semibold text-zinc-900">General guidance</p>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-zinc-700">
            {JSON.stringify(profile.general, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function FoodSafetyProfileEditor({
  value,
  onChange,
  isAdmin,
  disabled = false,
}: FoodSafetyProfileEditorProps) {
  const profile = asProfile(value);
  const mercury: ContaminantProfile = profile.mercury ?? {};
  const [newKey, setNewKey] = useState("");

  function emit(next: SafetyDraft) {
    onChange?.(toFoodSafetyProfile(next));
  }

  function patchMercury(patch: Partial<ContaminantProfile>) {
    emit({
      ...profile,
      mercury: { ...mercury, ...patch },
    });
  }

  function patchContaminant(
    key: string,
    patch: Partial<ContaminantProfile>,
  ) {
    const current = (profile[key] as ContaminantProfile | undefined) ?? {};
    emit({
      ...profile,
      [key]: { ...current, ...patch },
    });
  }

  function removeContaminant(key: string) {
    const next = { ...profile };
    delete next[key];
    emit(next);
  }

  function addContaminant() {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key || key === "general") return;
    if (profile[key]) {
      setNewKey("");
      return;
    }
    emit({
      ...profile,
      [key]: {},
    });
    setNewKey("");
  }

  const otherContaminants = contaminantEntries(profile).filter(
    (e) => e.key !== "mercury",
  );

  return (
    <section data-testid="food-safety-section" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">
          Food safety profile
        </h3>
        {!isAdmin ? (
          <span
            data-testid="safety-admin-only-badge"
            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600"
          >
            Admin edit only
          </span>
        ) : null}
      </div>

      {!isAdmin ? <ReadOnlySafety profile={profile} /> : null}

      {isAdmin ? (
        <div
          data-testid="safety-editor"
          className="space-y-4 rounded-lg border border-zinc-200 bg-white p-3"
        >
          <fieldset disabled={disabled} className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Mercury
            </legend>

            <label className="block text-xs font-medium text-zinc-600">
              FDA category
              <select
                data-testid="safety-mercury-fda"
                value={mercury.fda_category ?? ""}
                onChange={(e) =>
                  patchMercury({
                    fda_category: e.target.value || undefined,
                  })
                }
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">— Select —</option>
                {FDA_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Risk level
              <input
                type="text"
                data-testid="safety-mercury-risk"
                value={mercury.risk_level ?? ""}
                onChange={(e) =>
                  patchMercury({ risk_level: e.target.value || undefined })
                }
                placeholder="e.g. moderate"
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Recommended frequency
              <input
                type="text"
                data-testid="safety-mercury-frequency"
                value={mercury.recommended_frequency ?? ""}
                onChange={(e) =>
                  patchMercury({
                    recommended_frequency: e.target.value || undefined,
                  })
                }
                placeholder="e.g. 2–3 servings per week"
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Notes
              <textarea
                data-testid="safety-mercury-notes"
                rows={2}
                value={mercury.notes ?? ""}
                onChange={(e) =>
                  patchMercury({ notes: e.target.value || undefined })
                }
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Source
              <input
                type="text"
                data-testid="safety-mercury-source"
                value={mercury.source ?? ""}
                onChange={(e) =>
                  patchMercury({ source: e.target.value || undefined })
                }
                placeholder="e.g. FDA 2024"
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Last reviewed
              <input
                type="date"
                data-testid="safety-mercury-reviewed"
                value={mercury.last_reviewed ?? ""}
                onChange={(e) =>
                  patchMercury({
                    last_reviewed: e.target.value || undefined,
                  })
                }
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
          </fieldset>

          <div className="space-y-2 border-t border-zinc-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Other contaminants
            </p>
            {otherContaminants.map(({ key, profile: c }) => (
              <div
                key={key}
                data-testid={`safety-contaminant-${key}`}
                className="space-y-2 rounded border border-zinc-200 p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize text-zinc-800">
                    {key}
                  </span>
                  <button
                    type="button"
                    data-testid={`safety-remove-${key}`}
                    disabled={disabled}
                    onClick={() => removeContaminant(key)}
                    className="text-xs text-red-700 underline"
                  >
                    Remove
                  </button>
                </div>
                <label className="block text-xs font-medium text-zinc-600">
                  Notes
                  <input
                    type="text"
                    data-testid={`safety-contaminant-notes-${key}`}
                    disabled={disabled}
                    value={c.notes ?? ""}
                    onChange={(e) =>
                      patchContaminant(key, {
                        notes: e.target.value || undefined,
                      })
                    }
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-600">
                  Risk level
                  <input
                    type="text"
                    data-testid={`safety-contaminant-risk-${key}`}
                    disabled={disabled}
                    value={c.risk_level ?? ""}
                    onChange={(e) =>
                      patchContaminant(key, {
                        risk_level: e.target.value || undefined,
                      })
                    }
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            ))}

            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-zinc-600">
                Add contaminant key
                <input
                  type="text"
                  data-testid="safety-add-contaminant-key"
                  disabled={disabled}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. lead, pfas"
                  className="mt-1 block w-40 rounded border border-zinc-300 px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                data-testid="safety-add-contaminant"
                disabled={disabled || !newKey.trim()}
                onClick={addContaminant}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
