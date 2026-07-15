/**
 * Persistent nav: Calendar | Recipes | Ideas | Shopping (§9.4).
 * Bottom bar on mobile, side rail on md+. Task 11 calendar plugs into /calendar.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/calendar", label: "Calendar" },
  { href: "/recipes", label: "Recipes" },
  { href: "/ideas", label: "Ideas" },
  { href: "/shopping", label: "Shopping" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/calendar") return pathname === "/calendar" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Main"
      className="print:hidden border-t border-zinc-200 bg-white md:border-t-0 md:border-r md:w-48 md:min-h-screen"
    >
      <ul className="flex justify-around md:flex-col md:gap-1 md:p-3 md:pt-6">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 md:flex-none">
              <Link
                href={item.href}
                className={[
                  "flex flex-col items-center justify-center gap-0.5 px-2 py-3 text-xs font-medium md:flex-row md:justify-start md:gap-2 md:rounded-lg md:px-3 md:py-2 md:text-sm",
                  active
                    ? "text-emerald-700 md:bg-emerald-50"
                    : "text-zinc-600 hover:text-zinc-900 md:hover:bg-zinc-50",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
