/** Minimal className merger (shadcn-style). No clsx/tailwind-merge dep. */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

/** Format ISO date (YYYY-MM-DD) for display. */
export function formatIsoDate(iso: string): string {
  const d = iso.slice(0, 10);
  return d;
}

/** YYYY-MM-DD from a Date in local time. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
