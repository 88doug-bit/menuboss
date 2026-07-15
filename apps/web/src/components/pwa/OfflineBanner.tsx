/**
 * Global offline banner (D4 / §6.8). Visible whenever navigator is offline.
 */
"use client";

import {
  OFFLINE_WRITE_MESSAGE,
  useOnlineStatus,
} from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className="print:hidden border-b border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950"
    >
      <strong className="font-semibold">You&apos;re offline.</strong>{" "}
      Cached recipes and plans remain readable. {OFFLINE_WRITE_MESSAGE}
    </div>
  );
}
