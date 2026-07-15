/**
 * Authenticated route group. Server component on purpose:
 * - `dynamic = "force-dynamic"`: session-dependent pages must never be
 *   statically prerendered (build-time prerender constructs a Supabase
 *   client with no env and no user).
 * - The interactive shell (session gate, waiting-for-invite, nav) is the
 *   client component AuthedShell.
 */
import type { ReactNode } from "react";

import AuthedShell from "@/components/shell/AuthedShell";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AuthedShell>{children}</AuthedShell>;
}
