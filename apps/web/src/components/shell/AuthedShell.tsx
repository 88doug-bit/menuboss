"use client";

/**
 * Authenticated app shell. Gates on profile row (waiting-for-invite).
 * Hosts global search (§8.8) and admin nav entry (Task 15, display-only gate).
 * <!-- COORDINATOR: 0005 auth provisioning -->
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { useSession } from "@/providers/SessionProvider";
import { WaitingForInvite } from "@/components/auth/WaitingForInvite";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BASE_NAV = [
  { href: "/calendar", label: "Calendar" },
  { href: "/recipes", label: "Recipes" },
  { href: "/ideas", label: "Ideas" },
  { href: "/shopping", label: "Shopping" },
] as const;

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: sessionLoading, signOut } = useSession();
  const trpc = useTRPC();
  const pathname = usePathname();
  const meQuery = useQuery({
    ...trpc.family.me.queryOptions(),
    enabled: Boolean(user),
    retry: false,
  });

  const isAdmin = meQuery.data?.profile.role === "admin";
  const nav = isAdmin
    ? [...BASE_NAV, { href: "/admin", label: "Admin" } as const]
    : BASE_NAV;

  if (sessionLoading || (user && meQuery.isLoading)) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  // Session without profile → waiting for invite (not an error).
  if (user && meQuery.data === null && !meQuery.isError) {
    return <WaitingForInvite />;
  }

  // UNAUTHORIZED / FORBIDDEN from empty RLS family → treat as waiting.
  if (user && meQuery.isError) {
    const code = meQuery.error.data?.code;
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
      return <WaitingForInvite />;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
          <Link
            href="/calendar"
            className="shrink-0 text-sm font-semibold tracking-tight text-emerald-800"
          >
            MenuBoss
          </Link>
          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Primary"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-testid={
                  item.href === "/admin" ? "nav-admin" : undefined
                }
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  pathname.startsWith(item.href)
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-zinc-600 hover:bg-zinc-100",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <GlobalSearch className="min-w-0 flex-1 sm:max-w-sm md:flex-none" />
          <div className="flex shrink-0 items-center gap-2">
            {meQuery.data?.profile.displayName && (
              <span className="hidden text-xs text-zinc-500 lg:inline">
                {meQuery.data.profile.displayName}
              </span>
            )}
            <Button size="sm" variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1">{children}</main>

      <nav
        className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white sm:hidden"
        aria-label="Mobile primary"
      >
        <ul
          className={cn(
            "grid",
            isAdmin ? "grid-cols-5" : "grid-cols-4",
          )}
        >
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                data-testid={
                  item.href === "/admin" ? "nav-admin-mobile" : undefined
                }
                className={cn(
                  "flex h-12 items-center justify-center text-xs font-medium",
                  pathname.startsWith(item.href)
                    ? "text-emerald-800"
                    : "text-zinc-500",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
