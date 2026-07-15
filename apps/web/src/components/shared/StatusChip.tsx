/** Small chip for status / timer / temperature labels. */
export function StatusChip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "idea" | "researching" | "tested" | "adopted" | "abandoned" | "warn" | "accent";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-zinc-100 text-zinc-700",
    idea: "bg-sky-100 text-sky-800",
    researching: "bg-violet-100 text-violet-800",
    tested: "bg-amber-100 text-amber-900",
    adopted: "bg-emerald-100 text-emerald-800",
    abandoned: "bg-zinc-200 text-zinc-600",
    warn: "bg-amber-100 text-amber-900",
    accent: "bg-emerald-50 text-emerald-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
