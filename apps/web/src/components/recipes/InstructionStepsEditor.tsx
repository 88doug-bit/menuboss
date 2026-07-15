/**
 * Structured instruction steps editor: add / remove / reorder (up-down).
 * Optional timerMinutes + temperature per step (§8.1).
 */
"use client";

import type { InstructionStep } from "@menu-boss/schemas";

export type InstructionStepsEditorProps = {
  value: InstructionStep[];
  onChange: (next: InstructionStep[]) => void;
  disabled?: boolean;
};

function emptyStep(): InstructionStep {
  return { text: "" };
}

export function InstructionStepsEditor({
  value,
  onChange,
  disabled = false,
}: InstructionStepsEditorProps) {
  function updateAt(index: number, patch: Partial<InstructionStep>) {
    onChange(
      value.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    onChange(next);
  }

  function addStep() {
    onChange([...value, emptyStep()]);
  }

  return (
    <section data-testid="instruction-steps-editor" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Instructions</h3>
        <button
          type="button"
          data-testid="instruction-add"
          disabled={disabled}
          onClick={addStep}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          Add step
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-sm text-zinc-500" data-testid="instruction-empty">
          No steps yet — add structured instructions with optional timer and
          temperature.
        </p>
      ) : (
        <ol className="space-y-3">
          {value.map((step, index) => (
            <li
              key={index}
              data-testid={`instruction-step-${index}`}
              className="rounded-lg border border-zinc-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                  {index + 1}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    data-testid={`instruction-up-${index}`}
                    aria-label={`Move step ${index + 1} up`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    data-testid={`instruction-down-${index}`}
                    aria-label={`Move step ${index + 1} down`}
                    disabled={disabled || index === value.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    data-testid={`instruction-remove-${index}`}
                    disabled={disabled}
                    onClick={() => removeAt(index)}
                    className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <label className="block text-xs font-medium text-zinc-600">
                Step text
                <textarea
                  data-testid={`instruction-text-${index}`}
                  rows={2}
                  disabled={disabled}
                  value={step.text}
                  onChange={(e) => updateAt(index, { text: e.target.value })}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                  placeholder="Describe this step…"
                />
              </label>

              <div className="mt-2 flex flex-wrap gap-3">
                <label className="text-xs font-medium text-zinc-600">
                  Timer (min)
                  <input
                    type="number"
                    min={0}
                    data-testid={`instruction-timer-${index}`}
                    disabled={disabled}
                    value={step.timerMinutes ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        updateAt(index, { timerMinutes: undefined });
                        return;
                      }
                      const n = Number(raw);
                      updateAt(index, {
                        timerMinutes: Number.isFinite(n)
                          ? Math.max(0, Math.floor(n))
                          : undefined,
                      });
                    }}
                    className="mt-1 block w-24 rounded border border-zinc-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-zinc-600">
                  Temperature
                  <input
                    type="text"
                    data-testid={`instruction-temp-${index}`}
                    disabled={disabled}
                    value={step.temperature ?? ""}
                    onChange={(e) =>
                      updateAt(index, {
                        temperature: e.target.value || undefined,
                      })
                    }
                    placeholder="e.g. 350°F"
                    className="mt-1 block w-32 rounded border border-zinc-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Pure reorder helper (exported for unit tests). */
export function reorderSteps(
  steps: InstructionStep[],
  fromIndex: number,
  direction: -1 | 1,
): InstructionStep[] {
  const target = fromIndex + direction;
  if (target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  const tmp = next[fromIndex]!;
  next[fromIndex] = next[target]!;
  next[target] = tmp;
  return next;
}
