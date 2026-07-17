import { addDays, startOfWeek } from "date-fns";

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

/** The 7 days (Sun–Sat) of the week containing `anchor` — the app's single week convention. */
export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Lowercase kebab-case slug (tagCreateInputSchema contract). Returns ""
 * when the name has no usable characters — callers must treat that as
 * "cannot slugify", not as a valid slug.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
