/**
 * Pure client-side validation helpers for admin forms.
 * Mirrors packages/schemas/admin email + positive-number rules for UI feedback.
 */

/** Trim + lowercase email; returns null when empty after trim. */
export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when normalized email looks valid. */
export function isValidInviteEmail(raw: string): boolean {
  const email = normalizeInviteEmail(raw);
  return email.length > 0 && EMAIL_RE.test(email);
}

/**
 * Parse base protein ounces. Rejects ≤ 0, non-finite, empty.
 * Returns { ok: true, value } or { ok: false, message }.
 */
export function parseBaseProteinOz(
  raw: string | number,
): { ok: true; value: number } | { ok: false; message: string } {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    return { ok: false, message: "Base oz must be a finite number" };
  }
  if (n <= 0) {
    return { ok: false, message: "Base oz must be greater than 0" };
  }
  return { ok: true, value: n };
}

/** Kebab-case slug from a display name. */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
