/**
 * Warning-style food-safety callout for mercury (and similar) profiles (§9.5).
 * Pure presentational — testable without tRPC.
 */
export type MercurySafetyProfile = {
  fda_category?: string;
  recommended_frequency?: string;
  risk_level?: string;
  notes?: string;
  source?: string;
};

export function hasMercuryProfile(
  profile: unknown,
): profile is { mercury: MercurySafetyProfile } {
  if (!profile || typeof profile !== "object") return false;
  const mercury = (profile as { mercury?: unknown }).mercury;
  return mercury != null && typeof mercury === "object";
}

export function SafetyNoteCallout({
  mercury,
}: {
  mercury: MercurySafetyProfile;
}) {
  return (
    <div
      role="alert"
      data-testid="safety-note-callout"
      className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      <p className="font-semibold">Food safety — mercury</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-900">
        {mercury.fda_category ? (
          <li>
            FDA category: <strong>{mercury.fda_category}</strong>
          </li>
        ) : null}
        {mercury.recommended_frequency ? (
          <li>
            Recommended frequency:{" "}
            <strong>{mercury.recommended_frequency}</strong>
          </li>
        ) : null}
        {mercury.risk_level ? (
          <li>
            Risk level: <strong>{mercury.risk_level}</strong>
          </li>
        ) : null}
        {mercury.notes ? <li>{mercury.notes}</li> : null}
      </ul>
    </div>
  );
}
