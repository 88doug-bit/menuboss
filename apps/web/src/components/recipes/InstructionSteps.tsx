/**
 * Structured instruction steps with timer/temp chips.
 */
import { StatusChip } from "@/components/shared/StatusChip";

export type InstructionStepView = {
  text: string;
  timerMinutes?: number;
  temperature?: string;
};

export function parseInstructions(raw: unknown): InstructionStepView[] {
  if (!Array.isArray(raw)) return [];
  const out: InstructionStepView[] = [];
  for (const step of raw) {
    if (!step || typeof step !== "object") continue;
    const s = step as Record<string, unknown>;
    if (typeof s.text !== "string" || !s.text.trim()) continue;
    const entry: InstructionStepView = { text: s.text };
    if (typeof s.timerMinutes === "number") entry.timerMinutes = s.timerMinutes;
    if (typeof s.temperature === "string") entry.temperature = s.temperature;
    out.push(entry);
  }
  return out;
}

export function InstructionSteps({ steps }: { steps: InstructionStepView[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-zinc-500" data-testid="instructions-empty">
        No instructions yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="instruction-steps">
      {steps.map((step, i) => (
        <li
          key={i}
          className="flex gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2"
        >
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800"
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-900">{step.text}</p>
            {(step.timerMinutes != null || step.temperature) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {step.timerMinutes != null ? (
                  <StatusChip tone="accent">{step.timerMinutes} min</StatusChip>
                ) : null}
                {step.temperature ? (
                  <StatusChip tone="warn">{step.temperature}</StatusChip>
                ) : null}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
