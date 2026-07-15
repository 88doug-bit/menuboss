/**
 * App chrome: header + nav + main content area.
 */
"use client";

import type { ReactNode } from "react";

import { AppNav } from "./AppNav";

export function AppShell({
  children,
  title,
  actions,
}: {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <AppNav />
      <div className="flex min-h-0 flex-1 flex-col">
        {(title || actions) && (
          <header className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
            {title ? (
              <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
            ) : (
              <span />
            )}
            {actions ? (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            ) : null}
          </header>
        )}
        <main className="flex-1 px-4 py-4 pb-24 md:pb-6">{children}</main>
      </div>
    </div>
  );
}
