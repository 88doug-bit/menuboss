# Grok Task 12 — Content screens (recipes, ideas, combinations, shopping)

**Branch:** `implement/grok-12-content-screens`

## Summary

- Nav shell: **Calendar | Recipes | Ideas | Shopping** (bottom mobile / side desktop)
- Shared tRPC + QueryClient providers (Task 11 reuses — no duplicate trees)
- Recipe browser (filters, load more, interleaved ChefIdeas on search, Meals tab)
- Recipe detail: safety callouts, instruction chips, optimistic rating, leftover decay path, deleted badge, Add to Plan / Combination
- ChefIdea capture (FAB + form), browser, convertToRecipe → recipe detail
- RecipeCombination creator (up/down order, no dnd lib)
- Shopping list: category groups, Optional last, cross-dimension lines, deleted badge, localStorage checkoff, print + clipboard
- Component tests (18) green under `pnpm --filter web test`
- Added missing `chefIdea.byId` procedure (schema already defined; required for detail UI)

## Coordinator TODOs

- `<!-- TODO(coordinator): Phase 2 check-state sync -->`
- `<!-- TODO(coordinator): Task 11 session/auth provider nests inside AppProviders -->`
- `<!-- TODO(coordinator): Task 11 calendar dashboard mounts at /calendar -->`
- `<!-- TODO(coordinator): Task 11 plan editor preselect via ?addRecipe= -->`
- `<!-- TODO(coordinator): server-side hasSafetyFlags on recipe.list -->`
- `<!-- TODO(coordinator): Task 11 calendar multi-select handoff to shopping -->`

## Extensionless relative imports

All local imports omit file extensions (`./SafetyNoteCallout`, `@/lib/trpc/client`, etc.).

---

### FILE: apps/web/package.json

```json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.4.0",
    "@menu-boss/schemas": "workspace:*",
    "@supabase/ssr": "^0.12.1",
    "@supabase/supabase-js": "^2.110.4",
    "@tanstack/react-query": "^5.101.2",
    "@trpc/client": "^11.18.0",
    "@trpc/server": "^11.18.0",
    "@trpc/tanstack-react-query": "^11.18.0",
    "next": "16.2.10",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "react-hook-form": "^7.81.0",
    "superjson": "^2.2.6",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@playwright/test": "^1.61.1",
    "@tailwindcss/postcss": "^4",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.0.3",
    "eslint": "^9",
    "eslint-config-next": "16.2.10",
    "jsdom": "^29.1.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^3.2.7"
  }
}
```

### FILE: apps/web/vitest.config.ts

```ts
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Task 12 component tests. Server unit suites run under node package scripts /
    // packages/* vitest configs. Integration tests are opt-in.
    include: ["src/components/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "e2e/**", "**/*.integration.test.ts"],
  },
});
```

### FILE: apps/web/src/test/setup.ts

```ts
import "@testing-library/jest-dom/vitest";
```

### FILE: apps/web/src/lib/trpc/client.ts

```ts
/**
 * Shared tRPC client + TanStack React Query proxy.
 * Task 11 calendar/auth and Task 12 content screens both consume this â€”
 * do not create a second client or provider tree.
 */
"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import type { AppRouter } from "@/server/routers/_app";

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function createAppTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
      }),
    ],
  });
}
```

### FILE: apps/web/src/lib/trpc/query-client.ts

```ts
/**
 * TanStack QueryClient factory (browser singleton + server per-request).
 * Shared with Task 11 â€” do not instantiate a second QueryClient tree.
 */
import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
```

### FILE: apps/web/src/components/providers/AppProviders.tsx

```tsx
/**
 * Root client providers: QueryClient + tRPC.
 * Owned here for Task 12 nav shell; Task 11 plugs auth/session into the same tree.
 * <!-- TODO(coordinator): Task 11 session/auth provider nests inside this tree -->
 */
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { TRPCProvider, createAppTRPCClient } from "@/lib/trpc/client";
import { getQueryClient } from "@/lib/trpc/query-client";

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() => createAppTRPCClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

### FILE: apps/web/src/components/shell/AppNav.tsx

```tsx
/**
 * Persistent nav: Calendar | Recipes | Ideas | Shopping (Â§9.4).
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
```

### FILE: apps/web/src/components/shell/AppShell.tsx

```tsx
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
```

### FILE: apps/web/src/components/shell/EmptyState.tsx

```tsx
/**
 * Thoughtful empty states per Â§9.6.
 */
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center"
    >
      <p className="text-base font-medium text-zinc-800">{title}</p>
      {description ? (
        <p className="text-sm text-zinc-600">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
```

### FILE: apps/web/src/components/shared/DeletedBadge.tsx

```tsx
/** Soft-deleted entity badge â€” historical context only. */
export function DeletedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="deleted-badge"
      className={`inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 ${className}`}
    >
      deleted
    </span>
  );
}
```

### FILE: apps/web/src/components/shared/StatusChip.tsx

```tsx
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
```

### FILE: apps/web/src/components/shared/ContentFilters.tsx

```tsx
/**
 * Shared filter surface for recipes + chef ideas (categories, tags, time, rating).
 */
"use client";

import type { CategoryDto } from "@/server/routers/categoryMapper";
import type { TagDto } from "@/server/routers/tagMapper";

export type ContentFilterState = {
  q: string;
  categoryIds: string[];
  tagIds: string[];
  maxTotalMinutes: string;
  minRating: string;
  /** Client-side / future server filter â€” not on recipe.list yet. */
  hasSafetyFlags: boolean;
};

export const emptyFilters: ContentFilterState = {
  q: "",
  categoryIds: [],
  tagIds: [],
  maxTotalMinutes: "",
  minRating: "",
  hasSafetyFlags: false,
};

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function CategoryTreeNodes({
  nodes,
  selected,
  onToggle,
  depth = 0,
}: {
  nodes: CategoryDto[];
  selected: string[];
  onToggle: (id: string) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "space-y-1" : "ml-3 mt-1 space-y-1 border-l border-zinc-200 pl-2"}>
      {nodes.map((node) => (
        <li key={node.id}>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={selected.includes(node.id)}
              onChange={() => onToggle(node.id)}
              className="h-3.5 w-3.5 rounded border-zinc-300"
            />
            <span>{node.name}</span>
          </label>
          {node.children?.length ? (
            <CategoryTreeNodes
              nodes={node.children}
              selected={selected}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ContentFilters({
  value,
  onChange,
  categories = [],
  tags = [],
  showTimeAndRating = true,
  showSafetyFlag = true,
  searchPlaceholder = "Searchâ€¦",
}: {
  value: ContentFilterState;
  onChange: (next: ContentFilterState) => void;
  categories?: CategoryDto[];
  tags?: TagDto[];
  showTimeAndRating?: boolean;
  showSafetyFlag?: boolean;
  searchPlaceholder?: string;
}) {
  return (
    <div
      data-testid="content-filters"
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3"
    >
      <label className="block">
        <span className="sr-only">Search</span>
        <input
          type="search"
          data-testid="filter-search"
          placeholder={searchPlaceholder}
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
      </label>

      {showTimeAndRating ? (
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            Max time (min)
            <input
              type="number"
              min={0}
              data-testid="filter-max-time"
              value={value.maxTotalMinutes}
              onChange={(e) =>
                onChange({ ...value, maxTotalMinutes: e.target.value })
              }
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            Min rating
            <select
              data-testid="filter-min-rating"
              value={value.minRating}
              onChange={(e) =>
                onChange({ ...value, minRating: e.target.value })
              }
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}+
                </option>
              ))}
            </select>
          </label>
          {showSafetyFlag ? (
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                data-testid="filter-safety"
                checked={value.hasSafetyFlags}
                onChange={(e) =>
                  onChange({ ...value, hasSafetyFlags: e.target.checked })
                }
                className="h-3.5 w-3.5 rounded border-zinc-300"
              />
              Has safety flags
              {/* <!-- TODO(coordinator): server-side hasSafetyFlags on recipe.list --> */}
            </label>
          ) : null}
        </div>
      ) : null}

      {categories.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-zinc-800">
            Categories
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <CategoryTreeNodes
              nodes={categories}
              selected={value.categoryIds}
              onToggle={(id) =>
                onChange({
                  ...value,
                  categoryIds: toggleId(value.categoryIds, id),
                })
              }
            />
          </div>
        </details>
      ) : null}

      {tags.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-zinc-800">
            Tags
          </summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => {
              const on = value.tagIds.includes(tag.id);
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    data-testid={`filter-tag-${tag.id}`}
                    onClick={() =>
                      onChange({
                        ...value,
                        tagIds: toggleId(value.tagIds, tag.id),
                      })
                    }
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      on
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                    ].join(" ")}
                  >
                    {tag.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
```

### FILE: apps/web/src/components/recipes/SafetyNoteCallout.tsx

```tsx
/**
 * Warning-style food-safety callout for mercury (and similar) profiles (Â§9.5).
 * Pure presentational â€” testable without tRPC.
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
      <p className="font-semibold">Food safety â€” mercury</p>
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
```

### FILE: apps/web/src/components/recipes/SafetyNoteCallout.test.tsx

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IngredientLine } from "./IngredientLine";
import { SafetyNoteCallout, hasMercuryProfile } from "./SafetyNoteCallout";

describe("SafetyNoteCallout", () => {
  it("renders warning callout with FDA category and frequency when mercury profile present", () => {
    render(
      <SafetyNoteCallout
        mercury={{
          fda_category: "Good Choice",
          recommended_frequency: "1 serving/week",
          risk_level: "moderate",
        }}
      />,
    );

    const callout = screen.getByTestId("safety-note-callout");
    expect(callout).toHaveAttribute("role", "alert");
    expect(callout).toHaveTextContent("Good Choice");
    expect(callout).toHaveTextContent("1 serving/week");
    expect(callout).toHaveTextContent("moderate");
  });

  it("hasMercuryProfile detects mercury block only", () => {
    expect(hasMercuryProfile({ mercury: { fda_category: "Best" } })).toBe(
      true,
    );
    expect(hasMercuryProfile({ general: { cooking_temperature: "165F" } })).toBe(
      false,
    );
    expect(hasMercuryProfile(null)).toBe(false);
    expect(hasMercuryProfile({})).toBe(false);
  });

  it("IngredientLine shows callout only when profile has mercury", () => {
    const { rerender } = render(
      <IngredientLine
        name="Swordfish"
        quantity={6}
        unitLabel="oz"
        foodSafetyProfile={{
          mercury: {
            fda_category: "Choices to Avoid",
            recommended_frequency: "Avoid",
          },
        }}
      />,
    );
    expect(screen.getByTestId("safety-note-callout")).toBeInTheDocument();
    expect(screen.getByText(/Choices to Avoid/)).toBeInTheDocument();

    rerender(
      <IngredientLine
        name="Chicken"
        quantity={1}
        unitLabel="lb"
        foodSafetyProfile={{}}
      />,
    );
    expect(screen.queryByTestId("safety-note-callout")).not.toBeInTheDocument();
  });
});
```

### FILE: apps/web/src/components/recipes/MakeAgainRating.tsx

```tsx
/**
 * 1â€“5 make-again rating with optimistic update + rollback on error (Â§9.6).
 * Pure controlled component: parent owns optimistic state or uses the hook.
 */
"use client";

import { useCallback, useState } from "react";

export type RateHandler = (rating: number) => Promise<void>;

/**
 * Manages optimistic rating value; rolls back when `onRate` rejects.
 */
export function useOptimisticRating(
  initial: number | null | undefined,
  onRate: RateHandler,
) {
  const [value, setValue] = useState<number | null>(initial ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = useCallback(
    async (next: number) => {
      const previous = value;
      setValue(next);
      setPending(true);
      setError(null);
      try {
        await onRate(next);
      } catch (err) {
        setValue(previous);
        setError(err instanceof Error ? err.message : "Failed to save rating");
      } finally {
        setPending(false);
      }
    },
    [onRate, value],
  );

  /** Sync external initial when it changes and we are not pending. */
  const syncFromServer = useCallback(
    (server: number | null | undefined) => {
      if (!pending) setValue(server ?? null);
    },
    [pending],
  );

  return { value, pending, error, rate, setValue, syncFromServer };
}

export function MakeAgainRating({
  value,
  onRate,
  pending = false,
  disabled = false,
  label = "Make-again rating",
}: {
  value: number | null;
  onRate: (rating: number) => void | Promise<void>;
  pending?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-testid="make-again-rating"
      className="flex items-center gap-1"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            data-testid={`rating-star-${n}`}
            aria-label={`Rate ${n} of 5`}
            aria-pressed={value === n}
            disabled={disabled || pending}
            onClick={() => void onRate(n)}
            className={[
              "h-8 w-8 rounded-md text-lg leading-none transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600",
              "disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "text-amber-500 hover:text-amber-600"
                : "text-zinc-300 hover:text-amber-400",
            ].join(" ")}
          >
            â˜…
          </button>
        );
      })}
      {pending ? (
        <span className="ml-1 text-xs text-zinc-500" data-testid="rating-pending">
          Savingâ€¦
        </span>
      ) : null}
    </div>
  );
}
```

### FILE: apps/web/src/components/recipes/MakeAgainRating.test.tsx

```tsx
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MakeAgainRating, useOptimisticRating } from "./MakeAgainRating";

describe("useOptimisticRating", () => {
  it("optimistically updates then keeps value on success", async () => {
    const onRate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticRating(2, onRate));

    expect(result.current.value).toBe(2);

    await act(async () => {
      await result.current.rate(5);
    });

    expect(onRate).toHaveBeenCalledWith(5);
    expect(result.current.value).toBe(5);
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("rolls back to previous value when onRate rejects", async () => {
    const onRate = vi.fn().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useOptimisticRating(3, onRate));

    await act(async () => {
      await result.current.rate(5);
    });

    expect(result.current.value).toBe(3);
    expect(result.current.error).toBe("network down");
    expect(result.current.pending).toBe(false);
  });
});

describe("MakeAgainRating", () => {
  it("invokes onRate when a star is tapped", async () => {
    const user = userEvent.setup();
    const onRate = vi.fn().mockResolvedValue(undefined);

    render(<MakeAgainRating value={1} onRate={onRate} />);

    await user.click(screen.getByTestId("rating-star-4"));
    await waitFor(() => {
      expect(onRate).toHaveBeenCalledWith(4);
    });
  });

  it("disables stars while pending", () => {
    render(<MakeAgainRating value={2} onRate={vi.fn()} pending />);
    expect(screen.getByTestId("rating-star-1")).toBeDisabled();
    expect(screen.getByTestId("rating-pending")).toBeInTheDocument();
  });
});
```

### FILE: apps/web/src/components/recipes/LeftoverDecayPath.tsx

```tsx
/**
 * Expandable Creative Leftovers section (Â§9.2) with inline add/edit.
 * Pure presentational + local form state; parent persists via setLeftoverDecayPath.
 */
"use client";

import Link from "next/link";
import { useState } from "react";

export type DecayPathEntry = {
  use: string;
  notes?: string;
  linkedRecipeIds?: string[];
};

export function LeftoverDecayPath({
  entries,
  onSave,
  saving = false,
  recipeTitles = {},
}: {
  entries: DecayPathEntry[];
  onSave: (next: DecayPathEntry[]) => void | Promise<void>;
  saving?: boolean;
  /** Optional map recipeId â†’ title for linked chips. */
  recipeTitles?: Record<string, string>;
}) {
  const [open, setOpen] = useState(entries.length > 0);
  const [draftUse, setDraftUse] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);

  async function commitAdd() {
    const use = draftUse.trim();
    if (!use) return;
    const next: DecayPathEntry[] = [
      ...entries,
      {
        use,
        notes: draftNotes.trim() || undefined,
      },
    ];
    await onSave(next);
    setDraftUse("");
    setDraftNotes("");
  }

  async function commitEdit(index: number) {
    const use = draftUse.trim();
    if (!use) return;
    const next = entries.map((e, i) =>
      i === index
        ? {
            ...e,
            use,
            notes: draftNotes.trim() || undefined,
          }
        : e,
    );
    await onSave(next);
    setEditIndex(null);
    setDraftUse("");
    setDraftNotes("");
  }

  async function removeAt(index: number) {
    await onSave(entries.filter((_, i) => i !== index));
  }

  function startEdit(index: number) {
    const e = entries[index]!;
    setEditIndex(index);
    setDraftUse(e.use);
    setDraftNotes(e.notes ?? "");
    setOpen(true);
  }

  return (
    <section
      data-testid="leftover-decay-path"
      className="rounded-xl border border-zinc-200 bg-white"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-semibold text-zinc-900">Creative Leftovers</span>
        <span className="text-sm text-zinc-500">
          {entries.length} idea{entries.length === 1 ? "" : "s"} Â·{" "}
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-zinc-100 px-4 py-3">
          {entries.length === 0 ? (
            <p className="mb-3 text-sm text-zinc-600">
              No leftover ideas yet â€” capture how this dish becomes tomorrow&apos;s
              meal.
            </p>
          ) : (
            <ul className="mb-4 space-y-3">
              {entries.map((entry, index) => (
                <li
                  key={`${entry.use}-${index}`}
                  data-testid={`decay-entry-${index}`}
                  className="rounded-lg bg-zinc-50 px-3 py-2"
                >
                  {editIndex === index ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-zinc-600">
                        Use
                        <input
                          data-testid="decay-edit-use"
                          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                          value={draftUse}
                          onChange={(e) => setDraftUse(e.target.value)}
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-600">
                        Notes
                        <input
                          data-testid="decay-edit-notes"
                          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-testid="decay-save-edit"
                          disabled={saving}
                          className="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                          onClick={() => void commitEdit(index)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="rounded border border-zinc-300 px-3 py-1 text-sm"
                          onClick={() => {
                            setEditIndex(null);
                            setDraftUse("");
                            setDraftNotes("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-900">{entry.use}</p>
                          {entry.notes ? (
                            <p className="mt-0.5 text-sm text-zinc-600">
                              {entry.notes}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            data-testid={`decay-edit-${index}`}
                            className="text-xs text-emerald-700 underline"
                            onClick={() => startEdit(index)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            data-testid={`decay-remove-${index}`}
                            className="text-xs text-red-700 underline"
                            disabled={saving}
                            onClick={() => void removeAt(index)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {entry.linkedRecipeIds?.length ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {entry.linkedRecipeIds.map((id) => (
                            <li key={id}>
                              <Link
                                href={`/recipes/${id}`}
                                className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                              >
                                {recipeTitles[id] ?? "Linked recipe"}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {editIndex === null ? (
            <div
              data-testid="decay-add-form"
              className="space-y-2 rounded-lg border border-dashed border-zinc-300 p-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Add leftover idea
              </p>
              <label className="block text-xs font-medium text-zinc-600">
                Use
                <input
                  data-testid="decay-add-use"
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                  placeholder="e.g. Cuban sandwiches"
                  value={draftUse}
                  onChange={(e) => setDraftUse(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600">
                Notes
                <input
                  data-testid="decay-add-notes"
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                  placeholder="Optional notes"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                />
              </label>
              <button
                type="button"
                data-testid="decay-add-submit"
                disabled={saving || !draftUse.trim()}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void commitAdd()}
              >
                Add idea
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
```

### FILE: apps/web/src/components/recipes/LeftoverDecayPath.test.tsx

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeftoverDecayPath } from "./LeftoverDecayPath";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe("LeftoverDecayPath", () => {
  it("adds a new decay-path entry via inline form", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<LeftoverDecayPath entries={[]} onSave={onSave} />);

    // Expand empty section
    await user.click(screen.getByRole("button", { name: /Creative Leftovers/i }));

    await user.type(screen.getByTestId("decay-add-use"), "Cuban sandwiches");
    await user.type(screen.getByTestId("decay-add-notes"), "Use crusty rolls");
    await user.click(screen.getByTestId("decay-add-submit"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([
        { use: "Cuban sandwiches", notes: "Use crusty rolls" },
      ]);
    });
  });

  it("edits an existing entry and links navigate by recipe id", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const linkedId = "11111111-1111-1111-1111-111111111111";

    render(
      <LeftoverDecayPath
        entries={[
          {
            use: "Tacos",
            notes: "Soft shells",
            linkedRecipeIds: [linkedId],
          },
        ]}
        onSave={onSave}
        recipeTitles={{ [linkedId]: "Pork Tacos" }}
      />,
    );

    expect(screen.getByTestId("decay-entry-0")).toHaveTextContent("Tacos");
    const link = screen.getByRole("link", { name: "Pork Tacos" });
    expect(link).toHaveAttribute("href", `/recipes/${linkedId}`);

    await user.click(screen.getByTestId("decay-edit-0"));
    const useInput = screen.getByTestId("decay-edit-use");
    await user.clear(useInput);
    await user.type(useInput, "Carnitas bowls");
    await user.click(screen.getByTestId("decay-save-edit"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([
        {
          use: "Carnitas bowls",
          notes: "Soft shells",
          linkedRecipeIds: [linkedId],
        },
      ]);
    });
  });

  it("removes an entry", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <LeftoverDecayPath
        entries={[{ use: "Soup" }, { use: "Hash" }]}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByTestId("decay-remove-0"));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([{ use: "Hash" }]);
    });
  });
});
```

### FILE: apps/web/src/components/recipes/InstructionSteps.tsx

```tsx
/**
 * Structured instruction steps with timer/temp chips.
 */
import { StatusChip } from "@/components/shared/StatusChip";

export type InstructionStepView = {
  text: string;
  timerMinutes?: number;
  temperature?: string;
};

export function parseInstructions(raw: unknown): InstructionStepView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((step) => {
      if (!step || typeof step !== "object") return null;
      const s = step as Record<string, unknown>;
      if (typeof s.text !== "string" || !s.text.trim()) return null;
      return {
        text: s.text,
        timerMinutes:
          typeof s.timerMinutes === "number" ? s.timerMinutes : undefined,
        temperature:
          typeof s.temperature === "string" ? s.temperature : undefined,
      } satisfies InstructionStepView;
    })
    .filter((x): x is InstructionStepView => x != null);
}

export function InstructionSteps({ steps }: { steps: InstructionStepView[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-zinc-500" data-testid="instructions-empty">
        No instructions yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="instruction-steps">
      {steps.map((step, i) => (
        <li
          key={i}
          className="flex gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2"
        >
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800"
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-900">{step.text}</p>
            {(step.timerMinutes != null || step.temperature) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {step.timerMinutes != null ? (
                  <StatusChip tone="accent">{step.timerMinutes} min</StatusChip>
                ) : null}
                {step.temperature ? (
                  <StatusChip tone="warn">{step.temperature}</StatusChip>
                ) : null}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
```

### FILE: apps/web/src/components/recipes/IngredientLine.tsx

```tsx
/**
 * Recipe ingredient row with optional inline safety callout.
 */
import {
  SafetyNoteCallout,
  hasMercuryProfile,
} from "./SafetyNoteCallout";

export type IngredientLineProps = {
  name: string;
  quantity?: number | null;
  unitLabel?: string | null;
  preparationNote?: string | null;
  isOptional?: boolean;
  foodSafetyProfile?: unknown;
};

export function IngredientLine({
  name,
  quantity,
  unitLabel,
  preparationNote,
  isOptional,
  foodSafetyProfile,
}: IngredientLineProps) {
  const qty =
    quantity != null
      ? `${quantity}${unitLabel ? ` ${unitLabel}` : ""}`
      : null;

  return (
    <li data-testid="ingredient-line" className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {qty ? (
          <span className="font-medium tabular-nums text-zinc-900">{qty}</span>
        ) : null}
        <span className="text-zinc-800">
          {name}
          {isOptional ? (
            <span className="ml-1 text-xs text-zinc-500">(optional)</span>
          ) : null}
        </span>
        {preparationNote ? (
          <span className="text-sm text-zinc-500">â€” {preparationNote}</span>
        ) : null}
      </div>
      {hasMercuryProfile(foodSafetyProfile) ? (
        <SafetyNoteCallout mercury={foodSafetyProfile.mercury} />
      ) : null}
    </li>
  );
}
```

### FILE: apps/web/src/components/recipes/RecipeCard.tsx

```tsx
/**
 * Recipe card for browser grid.
 */
import Link from "next/link";

import { DeletedBadge } from "@/components/shared/DeletedBadge";

export function RecipeCard({
  id,
  title,
  description,
  totalTimeMinutes,
  makeAgainRating,
  isDeleted,
}: {
  id: string;
  title: string;
  description?: string | null;
  totalTimeMinutes?: number | null;
  makeAgainRating?: number | null;
  isDeleted?: boolean;
}) {
  return (
    <Link
      href={`/recipes/${id}`}
      data-testid="recipe-card"
      className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-zinc-900">{title}</h3>
        {isDeleted ? <DeletedBadge /> : null}
      </div>
      {description ? (
        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{description}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-3 text-xs text-zinc-500">
        {totalTimeMinutes != null ? <span>{totalTimeMinutes} min</span> : null}
        {makeAgainRating != null ? (
          <span aria-label={`Rated ${makeAgainRating} of 5`}>
            â˜… {makeAgainRating}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/** Visually distinct ChefIdea card interleaved in recipe search (Â§9.2). */
export function ChefIdeaSearchCard({
  id,
  title,
  notes,
  status,
}: {
  id: string;
  title: string;
  notes?: string | null;
  status?: string;
}) {
  return (
    <Link
      href={`/ideas/${id}`}
      data-testid="chef-idea-search-card"
      className="flex flex-col rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/60 p-4 transition hover:border-sky-400 hover:bg-sky-50"
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-sky-200/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
          Idea
        </span>
        {status ? (
          <span className="text-xs capitalize text-sky-800">{status}</span>
        ) : null}
      </div>
      <h3 className="mt-1 font-semibold text-sky-950">{title}</h3>
      {notes ? (
        <p className="mt-1 line-clamp-2 text-sm text-sky-900/80">{notes}</p>
      ) : null}
    </Link>
  );
}
```

### FILE: apps/web/src/components/recipes/RecipeBrowser.tsx

```tsx
/**
 * Recipe browser: filters, interleaved ChefIdeas on search, Meals tab, load more.
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ContentFilters,
  emptyFilters,
  type ContentFilterState,
} from "@/components/shared/ContentFilters";
import { EmptyState } from "@/components/shell/EmptyState";
import { useTRPC } from "@/lib/trpc/client";

import { CombinationCard } from "@/components/combinations/CombinationCard";
import { ChefIdeaSearchCard, RecipeCard } from "./RecipeCard";

type Tab = "recipes" | "meals";

export function RecipeBrowser() {
  const trpc = useTRPC();
  const [tab, setTab] = useState<Tab>("recipes");
  const [filters, setFilters] = useState<ContentFilterState>(emptyFilters);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [pages, setPages] = useState<
    Array<{ items: Array<Record<string, unknown>>; nextCursor: string | null }>
  >([]);

  const listInput = useMemo(() => {
    const input: {
      q?: string;
      categoryIds?: string[];
      tagIds?: string[];
      maxTotalMinutes?: number;
      minRating?: number;
      cursor?: string;
      limit: number;
    } = { limit: 20 };
    if (filters.q.trim()) input.q = filters.q.trim();
    if (filters.categoryIds.length) input.categoryIds = filters.categoryIds;
    if (filters.tagIds.length) input.tagIds = filters.tagIds;
    if (filters.maxTotalMinutes !== "") {
      const n = Number(filters.maxTotalMinutes);
      if (!Number.isNaN(n)) input.maxTotalMinutes = n;
    }
    if (filters.minRating !== "") {
      const n = Number(filters.minRating);
      if (n >= 1 && n <= 5) input.minRating = n as 1 | 2 | 3 | 4 | 5;
    }
    if (cursor) input.cursor = cursor;
    return input;
  }, [filters, cursor]);

  const categoriesQuery = useQuery(
    trpc.category.list.queryOptions({ activeOnly: true }),
  );
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));

  const recipesQuery = useQuery({
    ...trpc.recipe.list.queryOptions(listInput),
    enabled: tab === "recipes",
  });

  // Interleave ChefIdeas when search is non-empty (Â§9.2).
  const ideasQuery = useQuery({
    ...trpc.chefIdea.list.queryOptions({
      q: filters.q.trim() || undefined,
      categoryIds: filters.categoryIds.length
        ? filters.categoryIds
        : undefined,
      tagIds: filters.tagIds.length ? filters.tagIds : undefined,
      limit: 10,
    }),
    enabled: tab === "recipes" && filters.q.trim().length > 0,
  });

  const combosQuery = useQuery({
    ...trpc.recipeCombination.list.queryOptions({ limit: 20 }),
    enabled: tab === "meals",
  });

  // Accumulate pages when cursor advances
  const currentPage = recipesQuery.data;
  const allRecipes = useMemo(() => {
    if (!currentPage) return pages.flatMap((p) => p.items);
    if (!cursor) return currentPage.items;
    const prior = pages.flatMap((p) => p.items);
    // avoid dup if same page
    const ids = new Set(prior.map((r) => r.id as string));
    const merged = [
      ...prior,
      ...currentPage.items.filter((r) => !ids.has(r.id as string)),
    ];
    return merged;
  }, [currentPage, pages, cursor]);

  function onFilterChange(next: ContentFilterState) {
    setFilters(next);
    setCursor(undefined);
    setPages([]);
  }

  function loadMore() {
    if (!currentPage?.nextCursor) return;
    setPages((prev) => [
      ...prev,
      {
        items: currentPage.items as Array<Record<string, unknown>>,
        nextCursor: currentPage.nextCursor,
      },
    ]);
    setCursor(currentPage.nextCursor);
  }

  const catTree = categoriesQuery.data?.tree ?? [];
  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Recipes or meals"
          className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "recipes"}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === "recipes"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600",
            ].join(" ")}
            onClick={() => setTab("recipes")}
          >
            Recipes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "meals"}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === "meals"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600",
            ].join(" ")}
            onClick={() => setTab("meals")}
          >
            Meals
          </button>
        </div>
        {tab === "meals" ? (
          <Link
            href="/recipes/combinations/new"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            New combination
          </Link>
        ) : null}
      </div>

      {tab === "recipes" ? (
        <>
          <ContentFilters
            value={filters}
            onChange={onFilterChange}
            categories={catTree}
            tags={tags}
            searchPlaceholder="Search recipes (and ideas)â€¦"
          />

          {recipesQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading recipesâ€¦</p>
          ) : null}
          {recipesQuery.isError ? (
            <p className="text-sm text-red-600" role="alert">
              Could not load recipes.
            </p>
          ) : null}

          {!recipesQuery.isLoading &&
          allRecipes.length === 0 &&
          !(ideasQuery.data?.items.length) ? (
            <EmptyState
              title="No recipes yet"
              description="Add a family recipe or convert a ChefIdea when you're ready."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(ideasQuery.data?.items ?? []).map((idea) => (
                <ChefIdeaSearchCard
                  key={`idea-${idea.id}`}
                  id={idea.id}
                  title={idea.title}
                  notes={idea.notes}
                  status={idea.status}
                />
              ))}
              {allRecipes.map((r) => (
                <RecipeCard
                  key={r.id as string}
                  id={r.id as string}
                  title={r.title as string}
                  description={(r.description as string | null) ?? null}
                  totalTimeMinutes={
                    (r.totalTimeMinutes as number | null) ?? null
                  }
                  makeAgainRating={
                    (r.makeAgainRating as number | null) ?? null
                  }
                  isDeleted={Boolean(r.isDeleted)}
                />
              ))}
            </div>
          )}

          {currentPage?.nextCursor ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                data-testid="recipes-load-more"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                onClick={loadMore}
                disabled={recipesQuery.isFetching}
              >
                {recipesQuery.isFetching ? "Loadingâ€¦" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {combosQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading mealsâ€¦</p>
          ) : null}
          {!combosQuery.isLoading &&
          (combosQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              title="No meal combinations yet"
              description="Group recipes into a complete meal with roles and order."
              action={
                <Link
                  href="/recipes/combinations/new"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Create combination
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(combosQuery.data?.items ?? []).map((c) => (
                <CombinationCard
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  notes={c.notes}
                  makeAgainRating={c.makeAgainRating}
                  isTemplate={c.isTemplate}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

### FILE: apps/web/src/components/recipes/RecipeDetail.tsx

```tsx
/**
 * Recipe detail: ingredients + safety callouts, instructions, rating,
 * leftovers decay path, soft-delete badge, Add to Plan / Combination.
 */
"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { DeletedBadge } from "@/components/shared/DeletedBadge";
import { useTRPC } from "@/lib/trpc/client";
import type { LeftoverDecayPathEntry } from "@menu-boss/schemas";

import { IngredientLine } from "./IngredientLine";
import { InstructionSteps, parseInstructions } from "./InstructionSteps";
import {
  LeftoverDecayPath,
  type DecayPathEntry,
} from "./LeftoverDecayPath";
import { MakeAgainRating, useOptimisticRating } from "./MakeAgainRating";

function parseDecayPath(raw: unknown): DecayPathEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      if (typeof o.use !== "string" || !o.use.trim()) return null;
      return {
        use: o.use,
        notes: typeof o.notes === "string" ? o.notes : undefined,
        linkedRecipeIds: Array.isArray(o.linkedRecipeIds)
          ? (o.linkedRecipeIds as string[]).filter((id) => typeof id === "string")
          : undefined,
      } satisfies DecayPathEntry;
    })
    .filter((x): x is DecayPathEntry => x != null);
}

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const detailQuery = useQuery(trpc.recipe.byId.queryOptions({ id: recipeId }));

  const ingredientIds = useMemo(
    () =>
      (detailQuery.data?.ingredients ?? []).map((i) => i.ingredientId),
    [detailQuery.data?.ingredients],
  );

  const ingredientQueries = useQueries({
    queries: ingredientIds.map((id) =>
      trpc.ingredient.byId.queryOptions({ id }),
    ),
  });

  const ingredientById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; foodSafetyProfile: unknown }
    >();
    for (const q of ingredientQueries) {
      if (q.data) {
        map.set(q.data.id, {
          name: q.data.name,
          foodSafetyProfile: q.data.foodSafetyProfile,
        });
      }
    }
    return map;
  }, [ingredientQueries]);

  const rateMutation = useMutation(
    trpc.recipe.rate.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId }),
        );
      },
    }),
  );

  const decayMutation = useMutation(
    trpc.recipe.setLeftoverDecayPath.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId }),
        );
      },
    }),
  );

  const {
    value: ratingValue,
    pending: ratingPending,
    error: ratingError,
    rate,
  } = useOptimisticRating(
    detailQuery.data?.makeAgainRating,
    async (makeAgainRating) => {
      await rateMutation.mutateAsync({ id: recipeId, makeAgainRating });
    },
  );

  if (detailQuery.isLoading) {
    return <p className="text-sm text-zinc-500">Loading recipeâ€¦</p>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <p className="text-sm text-red-600" role="alert">
        Recipe not found or inaccessible.
      </p>
    );
  }

  const recipe = detailQuery.data;
  const steps = parseInstructions(recipe.instructions);
  const decay = parseDecayPath(recipe.leftoverDecayPath);
  const linkedIds = decay.flatMap((e) => e.linkedRecipeIds ?? []);
  // Titles for linked recipes â€” best-effort via parallel queries would be heavy;
  // links still navigate by id.
  const recipeTitles: Record<string, string> = {};
  for (const id of linkedIds) {
    recipeTitles[id] = "Linked recipe";
  }

  return (
    <article data-testid="recipe-detail" className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-zinc-900">{recipe.title}</h1>
          {recipe.isDeleted ? <DeletedBadge /> : null}
        </div>
        {recipe.description ? (
          <p className="text-zinc-600">{recipe.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-3 text-sm text-zinc-500">
          {recipe.totalTimeMinutes != null ? (
            <span>{recipe.totalTimeMinutes} min total</span>
          ) : null}
          {recipe.prepTimeMinutes != null ? (
            <span>Prep {recipe.prepTimeMinutes} min</span>
          ) : null}
          {recipe.cookTimeMinutes != null ? (
            <span>Cook {recipe.cookTimeMinutes} min</span>
          ) : null}
          <span>Serves {recipe.yieldServings}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-zinc-500">
            Make again
          </p>
          <MakeAgainRating
            value={ratingValue}
            onRate={rate}
            pending={ratingPending}
            disabled={recipe.isDeleted}
          />
          {ratingError ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {ratingError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/calendar?addRecipe=${recipe.id}`}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Add to Plan
          </Link>
          {/* <!-- TODO(coordinator): Task 11 plan editor preselect via ?addRecipe= --> */}
          <Link
            href={`/recipes/combinations/new?recipeId=${recipe.id}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Add to Combination
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">Ingredients</h2>
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white px-3">
          {[...(recipe.ingredients ?? [])]
            .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
            .map((ing) => {
              const meta = ingredientById.get(ing.ingredientId);
              return (
                <IngredientLine
                  key={ing.id}
                  name={meta?.name ?? "Ingredient"}
                  quantity={ing.quantity}
                  unitLabel={null}
                  preparationNote={ing.preparationNote}
                  isOptional={ing.isOptional}
                  foodSafetyProfile={meta?.foodSafetyProfile}
                />
              );
            })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">Instructions</h2>
        <InstructionSteps steps={steps} />
      </section>

      <LeftoverDecayPath
        entries={decay}
        saving={decayMutation.isPending}
        recipeTitles={recipeTitles}
        onSave={async (next) => {
          await decayMutation.mutateAsync({
            id: recipeId,
            leftoverDecayPath: next as LeftoverDecayPathEntry[],
          });
        }}
      />
    </article>
  );
}
```

### FILE: apps/web/src/components/shopping/shoppingListUtils.ts

```ts
/**
 * Pure shopping-list view helpers â€” grouping, line keys, plain-text export.
 * Cross-dimension lines stay separate under one ingredient heading (D12).
 */

export type ShoppingListLineView = {
  ingredientId: string;
  ingredientName: string;
  dimension: string;
  totalQuantityBase: number | null;
  displayQuantity: number | null;
  displayUnitAbbreviation: string | null;
  displayUnitName: string | null;
  isOptional: boolean;
  categoryName: string | null;
  sourceRecipeIds: string[];
  includesDeletedRecipe: boolean;
};

export type ShoppingListIngredientGroupView = {
  ingredientId: string;
  ingredientName: string;
  categoryName: string | null;
  isOptional: boolean;
  lines: ShoppingListLineView[];
};

export type ShoppingListViewModel = {
  required: ShoppingListIngredientGroupView[];
  optional: ShoppingListIngredientGroupView[];
};

export type CategorySection = {
  /** Display label; "Uncategorized" when null category. */
  categoryName: string;
  groups: ShoppingListIngredientGroupView[];
  isOptional: boolean;
};

/**
 * Group required lines by category_name (store aisle), then isolate Optional last.
 * Never merges cross-dimension lines â€” groups already hold separate `lines`.
 */
export function buildCategorySections(
  list: ShoppingListViewModel,
): CategorySection[] {
  const sections: CategorySection[] = [];

  const byCategory = new Map<string, ShoppingListIngredientGroupView[]>();
  for (const group of list.required) {
    const key = group.categoryName?.trim() || "Uncategorized";
    const bucket = byCategory.get(key) ?? [];
    bucket.push(group);
    byCategory.set(key, bucket);
  }

  const categoryNames = [...byCategory.keys()].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const name of categoryNames) {
    sections.push({
      categoryName: name,
      groups: byCategory.get(name)!,
      isOptional: false,
    });
  }

  if (list.optional.length > 0) {
    // Optional stays one visual block last, still ordered by category inside.
    const optByCat = new Map<string, ShoppingListIngredientGroupView[]>();
    for (const group of list.optional) {
      const key = group.categoryName?.trim() || "Uncategorized";
      const bucket = optByCat.get(key) ?? [];
      bucket.push(group);
      optByCat.set(key, bucket);
    }
    const flat = [...optByCat.keys()]
      .sort((a, b) => a.localeCompare(b))
      .flatMap((k) => optByCat.get(k)!);
    sections.push({
      categoryName: "Optional",
      groups: flat,
      isOptional: true,
    });
  }

  return sections;
}

/** Stable check-off key: ingredient + dimension + optional flag (cross-dim separate). */
export function shoppingLineKey(line: ShoppingListLineView): string {
  return `${line.ingredientId}::${line.dimension}::${line.isOptional ? "opt" : "req"}`;
}

export function formatLineQuantity(line: ShoppingListLineView): string {
  if (line.displayQuantity == null) return "â€”";
  const unit =
    line.displayUnitAbbreviation ?? line.displayUnitName ?? line.dimension;
  return `${line.displayQuantity} ${unit}`.trim();
}

/** Plain-text grouped list for clipboard / print-friendly copy. */
export function shoppingListToPlainText(
  sections: CategorySection[],
  checked: Record<string, boolean> = {},
): string {
  const parts: string[] = [];
  for (const section of sections) {
    parts.push(section.isOptional ? "Optional" : section.categoryName);
    parts.push("â”€".repeat(Math.min(section.categoryName.length + 4, 40)));
    for (const group of section.groups) {
      if (group.lines.length === 1) {
        const line = group.lines[0]!;
        const mark = checked[shoppingLineKey(line)] ? "[x]" : "[ ]";
        const del = line.includesDeletedRecipe ? " (deleted recipe)" : "";
        parts.push(
          `${mark} ${group.ingredientName}: ${formatLineQuantity(line)}${del}`,
        );
      } else {
        parts.push(`    ${group.ingredientName}:`);
        for (const line of group.lines) {
          const mark = checked[shoppingLineKey(line)] ? "[x]" : "[ ]";
          const del = line.includesDeletedRecipe ? " (deleted recipe)" : "";
          parts.push(`  ${mark} ${formatLineQuantity(line)}${del}`);
        }
      }
    }
    parts.push("");
  }
  return parts.join("\n").trimEnd();
}

export function isShoppingListEmpty(list: ShoppingListViewModel): boolean {
  return list.required.length === 0 && list.optional.length === 0;
}
```

### FILE: apps/web/src/components/shopping/useShoppingCheckoff.ts

```ts
/**
 * localStorage-backed shopping check-off state.
 * Keyed by sorted plan-id set. Server sync is Phase 2.
 * <!-- TODO(coordinator): Phase 2 check-state sync -->
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export function shoppingCheckoffStorageKey(planIds: string[]): string {
  const sorted = [...planIds].filter(Boolean).sort();
  return `menuboss:shopping-checkoff:${sorted.join(",") || "none"}`;
}

function readMap(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function useShoppingCheckoff(planIds: string[]) {
  const storageKey = useMemo(
    () => shoppingCheckoffStorageKey(planIds),
    [planIds],
  );
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked(readMap(storageKey));
  }, [storageKey]);

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      setChecked(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Quota / private mode â€” keep in-memory only.
      }
    },
    [storageKey],
  );

  const toggle = useCallback(
    (lineKey: string) => {
      persist({ ...checked, [lineKey]: !checked[lineKey] });
    },
    [checked, persist],
  );

  const isChecked = useCallback(
    (lineKey: string) => Boolean(checked[lineKey]),
    [checked],
  );

  const clearAll = useCallback(() => {
    persist({});
  }, [persist]);

  return { checked, toggle, isChecked, clearAll, storageKey };
}
```

### FILE: apps/web/src/components/shopping/ShoppingListView.tsx

```tsx
/**
 * Shopping list UI: category groups, Optional last, cross-dimension lines,
 * deleted-recipe badge, check-off, print + clipboard.
 */
"use client";

import { useMemo } from "react";

import { DeletedBadge } from "@/components/shared/DeletedBadge";
import { EmptyState } from "@/components/shell/EmptyState";

import {
  buildCategorySections,
  formatLineQuantity,
  isShoppingListEmpty,
  shoppingLineKey,
  shoppingListToPlainText,
  type ShoppingListViewModel,
} from "./shoppingListUtils";
import { useShoppingCheckoff } from "./useShoppingCheckoff";

export function ShoppingListView({
  list,
  planIds,
}: {
  list: ShoppingListViewModel;
  planIds: string[];
}) {
  const sections = useMemo(() => buildCategorySections(list), [list]);
  const { checked, toggle, clearAll } = useShoppingCheckoff(planIds);

  async function copyToClipboard() {
    const text = shoppingListToPlainText(sections, checked);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / denied permission
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  if (isShoppingListEmpty(list)) {
    return (
      <EmptyState
        title="Shopping list is empty"
        description="Nothing to buy for the selected plans â€” not an error. Pick plans from the calendar or enter plan ids."
      />
    );
  }

  return (
    <div data-testid="shopping-list-view" className="space-y-6">
      <div className="print:hidden flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="shopping-print"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          onClick={() => window.print()}
        >
          Print
        </button>
        <button
          type="button"
          data-testid="shopping-copy"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          onClick={() => void copyToClipboard()}
        >
          Copy to clipboard
        </button>
        <button
          type="button"
          data-testid="shopping-clear-checks"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          onClick={clearAll}
        >
          Clear checks
        </button>
      </div>

      {/* <!-- TODO(coordinator): Phase 2 check-state sync --> */}

      {sections.map((section) => (
        <section
          key={`${section.isOptional ? "opt" : "req"}-${section.categoryName}`}
          data-testid={
            section.isOptional
              ? "shopping-section-optional"
              : `shopping-section-${section.categoryName}`
          }
          className={
            section.isOptional
              ? "rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/80 p-4"
              : "space-y-3"
          }
        >
          <h2
            className={[
              "text-sm font-semibold uppercase tracking-wide",
              section.isOptional ? "text-zinc-600" : "text-zinc-800",
            ].join(" ")}
          >
            {section.categoryName}
          </h2>

          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {section.groups.map((group) => (
              <li
                key={`${group.ingredientId}-${group.isOptional}`}
                data-testid="shopping-ingredient-group"
                className="px-3 py-2"
              >
                <p className="text-sm font-medium text-zinc-900">
                  {group.ingredientName}
                </p>
                <ul className="mt-1 space-y-1">
                  {group.lines.map((line) => {
                    const key = shoppingLineKey(line);
                    const isOn = Boolean(checked[key]);
                    return (
                      <li
                        key={key}
                        data-testid="shopping-line"
                        data-dimension={line.dimension}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          data-testid={`check-${key}`}
                          checked={isOn}
                          onChange={() => toggle(key)}
                          className="h-4 w-4 rounded border-zinc-300"
                          aria-label={`Check off ${group.ingredientName} ${formatLineQuantity(line)}`}
                        />
                        <span
                          className={
                            isOn
                              ? "text-zinc-400 line-through"
                              : "tabular-nums text-zinc-800"
                          }
                        >
                          {formatLineQuantity(line)}
                        </span>
                        {line.includesDeletedRecipe ? (
                          <DeletedBadge />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

### FILE: apps/web/src/components/shopping/ShoppingListView.test.tsx

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShoppingListView } from "./ShoppingListView";
import {
  buildCategorySections,
  isShoppingListEmpty,
  shoppingLineKey,
  shoppingListToPlainText,
  type ShoppingListViewModel,
} from "./shoppingListUtils";

const sampleList: ShoppingListViewModel = {
  required: [
    {
      ingredientId: "ing-flour",
      ingredientName: "Flour",
      categoryName: "Baking",
      isOptional: false,
      lines: [
        {
          ingredientId: "ing-flour",
          ingredientName: "Flour",
          dimension: "mass",
          totalQuantityBase: 500,
          displayQuantity: 500,
          displayUnitAbbreviation: "g",
          displayUnitName: "gram",
          isOptional: false,
          categoryName: "Baking",
          sourceRecipeIds: ["r1"],
          includesDeletedRecipe: false,
        },
        {
          ingredientId: "ing-flour",
          ingredientName: "Flour",
          dimension: "volume",
          totalQuantityBase: 480,
          displayQuantity: 2,
          displayUnitAbbreviation: "cups",
          displayUnitName: "cup",
          isOptional: false,
          categoryName: "Baking",
          sourceRecipeIds: ["r2"],
          includesDeletedRecipe: true,
        },
      ],
    },
    {
      ingredientId: "ing-milk",
      ingredientName: "Milk",
      categoryName: "Dairy",
      isOptional: false,
      lines: [
        {
          ingredientId: "ing-milk",
          ingredientName: "Milk",
          dimension: "volume",
          totalQuantityBase: 1000,
          displayQuantity: 1,
          displayUnitAbbreviation: "L",
          displayUnitName: "liter",
          isOptional: false,
          categoryName: "Dairy",
          sourceRecipeIds: ["r1"],
          includesDeletedRecipe: false,
        },
      ],
    },
  ],
  optional: [
    {
      ingredientId: "ing-parsley",
      ingredientName: "Parsley",
      categoryName: "Produce",
      isOptional: true,
      lines: [
        {
          ingredientId: "ing-parsley",
          ingredientName: "Parsley",
          dimension: "count",
          totalQuantityBase: 1,
          displayQuantity: 1,
          displayUnitAbbreviation: "bunch",
          displayUnitName: "bunch",
          isOptional: true,
          categoryName: "Produce",
          sourceRecipeIds: ["r1"],
          includesDeletedRecipe: false,
        },
      ],
    },
  ],
};

describe("shoppingListUtils", () => {
  it("groups required by category and isolates Optional last", () => {
    const sections = buildCategorySections(sampleList);
    expect(sections.map((s) => s.categoryName)).toEqual([
      "Baking",
      "Dairy",
      "Optional",
    ]);
    expect(sections[sections.length - 1]!.isOptional).toBe(true);
    expect(sections[0]!.groups[0]!.ingredientName).toBe("Flour");
  });

  it("keeps cross-dimension lines separate under one ingredient", () => {
    const sections = buildCategorySections(sampleList);
    const flour = sections
      .flatMap((s) => s.groups)
      .find((g) => g.ingredientName === "Flour")!;
    expect(flour.lines).toHaveLength(2);
    expect(flour.lines.map((l) => l.dimension)).toEqual(["mass", "volume"]);
    expect(shoppingLineKey(flour.lines[0]!)).not.toBe(
      shoppingLineKey(flour.lines[1]!),
    );
  });

  it("plain text export includes deleted badge marker and optional section", () => {
    const text = shoppingListToPlainText(buildCategorySections(sampleList));
    expect(text).toContain("Flour");
    expect(text).toContain("500 g");
    expect(text).toContain("2 cups");
    expect(text).toContain("(deleted recipe)");
    expect(text).toMatch(/Optional/);
    expect(text).toContain("Parsley");
  });

  it("empty list helper treats empty required+optional as empty (not error)", () => {
    expect(
      isShoppingListEmpty({ required: [], optional: [] }),
    ).toBe(true);
    expect(isShoppingListEmpty(sampleList)).toBe(false);
  });
});

describe("ShoppingListView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders category groups with Optional last and deleted badge", () => {
    render(<ShoppingListView list={sampleList} planIds={["plan-a"]} />);

    const optional = screen.getByTestId("shopping-section-optional");
    expect(optional).toHaveTextContent("Parsley");

    // Optional section appears after required content in the DOM
    const view = screen.getByTestId("shopping-list-view");
    const sections = within(view).getAllByRole("heading", { level: 2 });
    expect(sections.map((h) => h.textContent)).toEqual([
      "Baking",
      "Dairy",
      "Optional",
    ]);

    expect(screen.getAllByTestId("deleted-badge").length).toBeGreaterThan(0);

    const flourGroup = screen
      .getAllByTestId("shopping-ingredient-group")
      .find((el) => el.textContent?.includes("Flour"))!;
    const dims = within(flourGroup)
      .getAllByTestId("shopping-line")
      .map((el) => el.getAttribute("data-dimension"));
    expect(dims).toEqual(["mass", "volume"]);
  });

  it("toggles check-off and persists to localStorage by plan id set", async () => {
    const user = userEvent.setup();
    render(<ShoppingListView list={sampleList} planIds={["b", "a"]} />);

    const line = sampleList.required[1]!.lines[0]!;
    const key = shoppingLineKey(line);
    const checkbox = screen.getByTestId(`check-${key}`);

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    const stored = window.localStorage.getItem(
      "menuboss:shopping-checkoff:a,b",
    );
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toMatchObject({ [key]: true });
  });

  it("shows empty state when list has no lines", () => {
    render(
      <ShoppingListView
        list={{ required: [], optional: [] }}
        planIds={["p1"]}
      />,
    );
    expect(screen.getByText(/Shopping list is empty/i)).toBeInTheDocument();
  });

  it("copy to clipboard uses plain text export", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    render(<ShoppingListView list={sampleList} planIds={["p1"]} />);
    await user.click(screen.getByTestId("shopping-copy"));
    expect(writeText).toHaveBeenCalled();
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain("Flour");
    expect(text).toContain("Optional");
    vi.unstubAllGlobals();
  });
});
```

### FILE: apps/web/src/components/ideas/ChefIdeaBrowser.tsx

```tsx
/**
 * ChefIdea browser with filter surface + status chips + Capture CTA.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ContentFilters,
  emptyFilters,
  type ContentFilterState,
} from "@/components/shared/ContentFilters";
import { StatusChip } from "@/components/shared/StatusChip";
import { EmptyState } from "@/components/shell/EmptyState";
import { useTRPC } from "@/lib/trpc/client";
import type { ChefIdeaStatus } from "@menu-boss/schemas";

const STATUSES: ChefIdeaStatus[] = [
  "idea",
  "researching",
  "tested",
  "adopted",
  "abandoned",
];

function statusTone(
  s: string,
): "idea" | "researching" | "tested" | "adopted" | "abandoned" | "neutral" {
  if (
    s === "idea" ||
    s === "researching" ||
    s === "tested" ||
    s === "adopted" ||
    s === "abandoned"
  ) {
    return s;
  }
  return "neutral";
}

export function ChefIdeaBrowser({
  onCapture,
}: {
  onCapture: () => void;
}) {
  const trpc = useTRPC();
  const [filters, setFilters] = useState<ContentFilterState>(emptyFilters);
  const [status, setStatus] = useState<ChefIdeaStatus | "">("");

  const categoriesQuery = useQuery(
    trpc.category.list.queryOptions({ activeOnly: true }),
  );
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));

  const listInput = useMemo(() => {
    return {
      limit: 40 as const,
      q: filters.q.trim() || undefined,
      status: status || undefined,
      categoryIds: filters.categoryIds.length
        ? filters.categoryIds
        : undefined,
      tagIds: filters.tagIds.length ? filters.tagIds : undefined,
    };
  }, [filters, status]);

  const listQuery = useQuery(trpc.chefIdea.list.queryOptions(listInput));

  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
          <button
            type="button"
            onClick={() => setStatus("")}
            className={[
              "rounded-full px-2.5 py-1 text-xs font-medium",
              status === ""
                ? "bg-zinc-800 text-white"
                : "bg-zinc-100 text-zinc-700",
            ].join(" ")}
          >
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`status-filter-${s}`}
              onClick={() => setStatus(s)}
              className={[
                "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                status === s
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-700",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="capture-idea-header"
          onClick={onCapture}
          className="hidden rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 sm:inline-flex"
        >
          + Capture Idea
        </button>
      </div>

      <ContentFilters
        value={filters}
        onChange={setFilters}
        categories={categoriesQuery.data?.tree ?? []}
        tags={tags}
        showTimeAndRating={false}
        showSafetyFlag={false}
        searchPlaceholder="Search ideasâ€¦"
      />

      {listQuery.isLoading ? (
        <p className="text-sm text-zinc-500">Loading ideasâ€¦</p>
      ) : null}

      {!listQuery.isLoading && (listQuery.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="Capture your first ChefIdea"
          description="Note a promising dish, source, or technique â€” convert it to a recipe when ready."
          action={
            <button
              type="button"
              onClick={onCapture}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              + Capture Idea
            </button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(listQuery.data?.items ?? []).map((idea) => (
            <li key={idea.id}>
              <Link
                href={`/ideas/${idea.id}`}
                data-testid="chef-idea-card"
                className="block rounded-xl border border-sky-200 bg-sky-50/40 p-4 hover:border-sky-400"
              >
                <div className="flex items-center gap-2">
                  <StatusChip tone={statusTone(idea.status)}>
                    {idea.status}
                  </StatusChip>
                  {idea.priority != null ? (
                    <span className="text-xs text-zinc-500">
                      P{idea.priority}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-1 font-semibold text-zinc-900">{idea.title}</h3>
                {idea.notes ? (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
                    {idea.notes}
                  </p>
                ) : null}
                {idea.convertedRecipeId ? (
                  <p className="mt-2 text-xs text-emerald-700">
                    Adopted â†’ recipe
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Mobile FAB */}
      <button
        type="button"
        data-testid="capture-idea-fab"
        onClick={onCapture}
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-2xl font-light text-white shadow-lg hover:bg-sky-700 sm:hidden md:bottom-6"
        aria-label="Capture Idea"
      >
        +
      </button>
    </div>
  );
}

export function ChefIdeaCaptureForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery(
    trpc.category.list.queryOptions({ activeOnly: true }),
  );
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<ChefIdeaStatus>("idea");
  const [priority, setPriority] = useState<string>("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation(
    trpc.chefIdea.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(trpc.chefIdea.list.queryFilter());
        onCreated(created.id);
      },
    }),
  );

  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];
  const flatCats = categoriesQuery.data?.flat ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        notes: notes.trim() || undefined,
        source: source.trim() || undefined,
        status,
        priority: priority ? (Number(priority) as 1 | 2 | 3) : undefined,
        categoryIds,
        tagIds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save idea");
    }
  }

  function toggle(ids: string[], id: string) {
    return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-idea-title"
      data-testid="capture-idea-form"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="capture-idea-title" className="text-lg font-semibold">
            Capture Idea
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-700">
            Title
            <input
              required
              data-testid="idea-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            Notes
            <textarea
              data-testid="idea-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            Source
            <input
              data-testid="idea-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm font-medium text-zinc-700">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ChefIdeaStatus)}
                className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">â€”</option>
                <option value="1">1 (highest)</option>
                <option value="2">2</option>
                <option value="3">3 (lowest)</option>
              </select>
            </label>
          </div>

          {flatCats.length > 0 ? (
            <fieldset>
              <legend className="text-sm font-medium text-zinc-700">
                Categories
              </legend>
              <ul className="mt-1 flex flex-wrap gap-2">
                {flatCats.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setCategoryIds((ids) => toggle(ids, c.id))
                      }
                      className={[
                        "rounded-full px-2 py-0.5 text-xs",
                        categoryIds.includes(c.id)
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}

          {tags.length > 0 ? (
            <fieldset>
              <legend className="text-sm font-medium text-zinc-700">Tags</legend>
              <ul className="mt-1 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTagIds((ids) => toggle(ids, t.id))}
                      className={[
                        "rounded-full px-2 py-0.5 text-xs",
                        tagIds.includes(t.id)
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {createMutation.isPending ? "Savingâ€¦" : "Save idea"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

### FILE: apps/web/src/components/ideas/ChefIdeaDetail.tsx

```tsx
/**
 * ChefIdea detail + convertToRecipe flow.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusChip } from "@/components/shared/StatusChip";
import { useTRPC } from "@/lib/trpc/client";

export function ChefIdeaDetail({ ideaId }: { ideaId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ideaQuery = useQuery(trpc.chefIdea.byId.queryOptions({ id: ideaId }));

  const convertMutation = useMutation(
    trpc.chefIdea.convertToRecipe.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(
          trpc.chefIdea.byId.queryFilter({ id: ideaId }),
        );
        // Route to recipe detail (edit view arrives with Task 11/later edit page).
        router.push(`/recipes/${result.recipe.id}`);
      },
    }),
  );

  if (ideaQuery.isLoading) {
    return <p className="text-sm text-zinc-500">Loading ideaâ€¦</p>;
  }
  if (ideaQuery.isError || !ideaQuery.data) {
    return (
      <p className="text-sm text-red-600" role="alert">
        Idea not found.
      </p>
    );
  }

  const idea = ideaQuery.data;

  async function convert() {
    setError(null);
    setConverting(true);
    try {
      await convertMutation.mutateAsync({ id: ideaId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed");
      setConverting(false);
    }
  }

  return (
    <article className="mx-auto max-w-xl space-y-4" data-testid="chef-idea-detail">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip
          tone={
            idea.status === "idea" ||
            idea.status === "researching" ||
            idea.status === "tested" ||
            idea.status === "adopted" ||
            idea.status === "abandoned"
              ? idea.status
              : "neutral"
          }
        >
          {idea.status}
        </StatusChip>
        {idea.priority != null ? (
          <span className="text-sm text-zinc-500">Priority {idea.priority}</span>
        ) : null}
      </div>
      <h1 className="text-2xl font-bold text-zinc-900">{idea.title}</h1>
      {idea.source ? (
        <p className="text-sm text-zinc-500">Source: {idea.source}</p>
      ) : null}
      {idea.notes ? (
        <p className="whitespace-pre-wrap text-zinc-700">{idea.notes}</p>
      ) : null}

      {idea.convertedRecipeId ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Adopted â€”{" "}
          <Link
            href={`/recipes/${idea.convertedRecipeId}`}
            className="font-medium underline"
            data-testid="adopted-recipe-link"
          >
            open converted recipe
          </Link>
        </p>
      ) : (
        <button
          type="button"
          data-testid="convert-to-recipe"
          disabled={converting}
          onClick={() => void convert()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {converting ? "Convertingâ€¦" : "Convert to Recipe"}
        </button>
      )}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
```

### FILE: apps/web/src/components/combinations/CombinationCard.tsx

```tsx
import Link from "next/link";

export function CombinationCard({
  id,
  name,
  notes,
  makeAgainRating,
  isTemplate,
}: {
  id: string;
  name: string;
  notes?: string | null;
  makeAgainRating?: number | null;
  isTemplate?: boolean;
}) {
  return (
    <Link
      href={`/recipes/combinations/${id}`}
      data-testid="combination-card"
      className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-emerald-300"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-zinc-900">{name}</h3>
        {isTemplate ? (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
            Template
          </span>
        ) : null}
      </div>
      {notes ? (
        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{notes}</p>
      ) : null}
      {makeAgainRating != null ? (
        <p className="mt-2 text-xs text-zinc-500">â˜… {makeAgainRating}</p>
      ) : null}
    </Link>
  );
}
```

### FILE: apps/web/src/components/combinations/CombinationCreator.tsx

```tsx
/**
 * RecipeCombination creator: pick recipes, role + order (up/down, no dnd lib),
 * notes, rating, save-as-template.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { RoleInMeal } from "@menu-boss/schemas";
import { useTRPC } from "@/lib/trpc/client";

const ROLES: RoleInMeal[] = [
  "main",
  "side",
  "dessert",
  "appetizer",
  "other",
];

type DraftLine = {
  key: string;
  recipeId: string;
  recipeTitle: string;
  roleInMeal: RoleInMeal;
  notes: string;
};

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return `line-${keySeq}`;
}

export function CombinationCreator() {
  const trpc = useTRPC();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const preselectId = searchParams.get("recipeId");

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<string>("");
  const [isTemplate, setIsTemplate] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const searchQuery = useQuery({
    ...trpc.recipe.list.queryOptions({
      q: search.trim() || undefined,
      limit: 12,
    }),
    enabled: search.trim().length > 0,
  });

  // Prefill recipe from query string once.
  const preselectQuery = useQuery({
    ...trpc.recipe.byId.queryOptions({ id: preselectId! }),
    enabled: Boolean(preselectId),
  });

  useEffect(() => {
    if (!preselectQuery.data) return;
    const r = preselectQuery.data;
    setLines((prev) => {
      if (prev.some((l) => l.recipeId === r.id)) return prev;
      return [
        ...prev,
        {
          key: nextKey(),
          recipeId: r.id,
          recipeTitle: r.title,
          roleInMeal: "main",
          notes: "",
        },
      ];
    });
  }, [preselectQuery.data]);

  const createMutation = useMutation(
    trpc.recipeCombination.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(
          trpc.recipeCombination.list.queryFilter(),
        );
        router.push(`/recipes/combinations/${created.id}`);
      },
    }),
  );

  function addRecipe(id: string, title: string) {
    setLines((prev) => {
      if (prev.some((l) => l.recipeId === id)) return prev;
      return [
        ...prev,
        {
          key: nextKey(),
          recipeId: id,
          recipeTitle: title,
          roleInMeal: prev.length === 0 ? "main" : "side",
          notes: "",
        },
      ];
    });
    setSearch("");
  }

  function move(index: number, dir: -1 | 1) {
    setLines((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one recipe");
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        notes: notes.trim() || undefined,
        makeAgainRating: rating
          ? (Number(rating) as 1 | 2 | 3 | 4 | 5)
          : undefined,
        isTemplate,
        recipes: lines.map((l, i) => ({
          recipeId: l.recipeId,
          roleInMeal: l.roleInMeal,
          sequenceOrder: i,
          notes: l.notes.trim() || undefined,
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <form
      data-testid="combination-creator"
      onSubmit={(e) => void submit(e)}
      className="mx-auto max-w-xl space-y-4"
    >
      <label className="block text-sm font-medium text-zinc-700">
        Meal name
        <input
          data-testid="combo-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Sunday roast plate"
        />
      </label>

      <label className="block text-sm font-medium text-zinc-700">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Timing / pairing comments"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="text-sm font-medium text-zinc-700">
          Make-again
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          >
            <option value="">â€”</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={(e) => setIsTemplate(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Save as template
        </label>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-800">Recipes</h2>
        <label className="block text-sm text-zinc-600">
          Search recipes to add
          <input
            data-testid="combo-recipe-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Type to searchâ€¦"
          />
        </label>
        {search.trim() && searchQuery.data?.items.length ? (
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
            {searchQuery.data.items.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                  onClick={() => addRecipe(r.id, r.title)}
                >
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {lines.length === 0 ? (
          <p className="text-sm text-zinc-500">No recipes yet â€” search above.</p>
        ) : (
          <ul className="space-y-2" data-testid="combo-lines">
            {lines.map((line, index) => (
              <li
                key={line.key}
                data-testid={`combo-line-${index}`}
                className="rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-zinc-900">
                    {index + 1}. {line.recipeTitle}
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      data-testid={`combo-up-${index}`}
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                    >
                      â†‘
                    </button>
                    <button
                      type="button"
                      data-testid={`combo-down-${index}`}
                      aria-label="Move down"
                      disabled={index === lines.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                    >
                      â†“
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="text-xs text-zinc-600">
                    Role
                    <select
                      value={line.roleInMeal}
                      onChange={(e) =>
                        updateLine(index, {
                          roleInMeal: e.target.value as RoleInMeal,
                        })
                      }
                      className="ml-1 rounded border border-zinc-300 px-1.5 py-0.5 text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-[12rem] flex-1 text-xs text-zinc-600">
                    Notes
                    <input
                      value={line.notes}
                      onChange={(e) =>
                        updateLine(index, { notes: e.target.value })
                      }
                      className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="combo-save"
        disabled={createMutation.isPending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {createMutation.isPending ? "Savingâ€¦" : "Save combination"}
      </button>
    </form>
  );
}
```

### FILE: apps/web/src/app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppProviders } from "@/components/providers/AppProviders";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MenuBoss",
  description: "Family recipe & meal planning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
```

### FILE: apps/web/src/app/page.tsx

```tsx
import { redirect } from "next/navigation";

/** App entry â€” primary screen is calendar (Â§9.2 / Â§9.4). */
export default function HomePage() {
  redirect("/calendar");
}
```

### FILE: apps/web/src/app/globals.css

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}

/* Shopping list print stylesheet */
@media print {
  body {
    background: white;
    color: black;
  }

  nav,
  header,
  .print\:hidden,
  [data-testid="shopping-print"],
  [data-testid="shopping-copy"],
  [data-testid="shopping-clear-checks"] {
    display: none !important;
  }

  main {
    padding: 0 !important;
  }

  [data-testid="shopping-list-view"] {
    font-size: 12pt;
  }

  [data-testid="shopping-section-optional"] {
    border: 1px dashed #666 !important;
  }
}
```

### FILE: apps/web/src/app/(app)/layout.tsx

```tsx
/**
 * Authenticated app shell layout with Calendar | Recipes | Ideas | Shopping nav.
 * Task 11 plugs calendar into /calendar; providers live at root.
 */
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

### FILE: apps/web/src/app/(app)/calendar/page.tsx

```tsx
/**
 * Calendar placeholder â€” Task 11 owns the full calendar/plan editor.
 * <!-- TODO(coordinator): Task 11 calendar dashboard mounts here -->
 */
import Link from "next/link";

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Calendar</h1>
      <p className="text-sm text-zinc-600">
        Meal planning calendar arrives with Task 11. Shopping list can still be
        opened with plan ids from a handoff query string.
      </p>
      <Link
        href="/shopping"
        className="inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
      >
        Open shopping list
      </Link>
    </div>
  );
}
```

### FILE: apps/web/src/app/(app)/recipes/page.tsx

```tsx
import { RecipeBrowser } from "@/components/recipes/RecipeBrowser";

export default function RecipesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Recipes</h1>
      <RecipeBrowser />
    </div>
  );
}
```

### FILE: apps/web/src/app/(app)/recipes/combinations/new/page.tsx

```tsx
import { Suspense } from "react";

import { CombinationCreator } from "@/components/combinations/CombinationCreator";

export default function NewCombinationPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">New meal combination</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loadingâ€¦</p>}>
        <CombinationCreator />
      </Suspense>
    </div>
  );
}
```

### FILE: apps/web/src/app/(app)/ideas/page.tsx

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ChefIdeaBrowser,
  ChefIdeaCaptureForm,
} from "@/components/ideas/ChefIdeaBrowser";

export default function IdeasPage() {
  const [captureOpen, setCaptureOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Ideas</h1>
      <ChefIdeaBrowser onCapture={() => setCaptureOpen(true)} />
      {captureOpen ? (
        <ChefIdeaCaptureForm
          onClose={() => setCaptureOpen(false)}
          onCreated={(id) => {
            setCaptureOpen(false);
            router.push(`/ideas/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}
```

### FILE: apps/web/src/app/(app)/shopping/page.tsx

```tsx
/**
 * Shopping list screen â€” plan ids via ?planIds=id1,id2 (calendar handoff).
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { ShoppingListView } from "@/components/shopping/ShoppingListView";
import { EmptyState } from "@/components/shell/EmptyState";
import { useTRPC } from "@/lib/trpc/client";

function ShoppingPageInner() {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const fromQuery = searchParams.get("planIds") ?? searchParams.get("plans") ?? "";
  const [manualIds, setManualIds] = useState("");

  const planIds = useMemo(() => {
    const raw = (fromQuery || manualIds)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return [...new Set(raw)];
  }, [fromQuery, manualIds]);

  const listQuery = useQuery({
    ...trpc.mealPlan.generateShoppingList.queryOptions({
      mealPlanIds: planIds,
    }),
    enabled: planIds.length > 0,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Shopping</h1>

      {!fromQuery ? (
        <label className="block text-sm text-zinc-700">
          Meal plan ids (comma-separated)
          {/* <!-- TODO(coordinator): Task 11 calendar multi-select handoff --> */}
          <input
            data-testid="shopping-plan-ids"
            value={manualIds}
            onChange={(e) => setManualIds(e.target.value)}
            placeholder="uuid, uuid, â€¦"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
      ) : (
        <p className="text-sm text-zinc-600">
          Plans: {planIds.join(", ")}
        </p>
      )}

      {planIds.length === 0 ? (
        <EmptyState
          title="Select plans to generate a list"
          description="Open Shopping from the calendar with selected plan ids, or paste ids above. An empty list after generation is not an error."
        />
      ) : listQuery.isLoading ? (
        <p className="text-sm text-zinc-500">Generating shopping listâ€¦</p>
      ) : listQuery.isError ? (
        <p className="text-sm text-red-600" role="alert">
          Could not generate shopping list.
        </p>
      ) : listQuery.data ? (
        <ShoppingListView list={listQuery.data} planIds={planIds} />
      ) : null}
    </div>
  );
}

export default function ShoppingPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loadingâ€¦</p>}>
      <ShoppingPageInner />
    </Suspense>
  );
}
```

### FILE: apps/web/src/server/routers/chefIdea.ts

```ts
/**
 * chefIdea router â€” family-global content (D7).
 * convertToRecipe creates a recipe preserving notes/tags/categories and
 * links convertedRecipeId (DB: linked_recipe_id).
 */
import {
  chefIdeaByIdInputSchema,
  chefIdeaConvertToRecipeInputSchema,
  chefIdeaCreateInputSchema,
  chefIdeaListInputSchema,
  chefIdeaSetStatusInputSchema,
  chefIdeaUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { authedProcedure, createTRPCRouter } from "../trpc";
import {
  chefIdeaWriteFields,
  mapChefIdeaRow,
  type ChefIdeaRow,
} from "./chefIdeaMapper";
import { mapRecipeRow, type RecipeRow } from "./recipeMapper";

async function replaceChefIdeaJunction(
  supabase: import("../trpc").AppSupabaseClient,
  table: "chef_idea_category" | "chef_idea_tag",
  fkCol: "category_id" | "tag_id",
  chefIdeaId: string,
  ids: string[],
) {
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("chef_idea_id", chefIdeaId);
  if (delErr) throwFromPostgrest(delErr);
  if (ids.length === 0) return;
  const rows = ids.map((id) => ({
    chef_idea_id: chefIdeaId,
    [fkCol]: id,
  }));
  const { error: insErr } = await supabase.from(table).insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

export const chefIdeaRouter = createTRPCRouter({
  list: authedProcedure
    .input(chefIdeaListInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;
      let query = ctx.supabase
        .from("chef_idea")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (input.status) {
        query = query.eq("status", input.status);
      }
      if (input.priority !== undefined) {
        query = query.eq("priority", input.priority);
      }
      if (input.q) {
        query = query.or(
          `title.ilike.%${input.q}%,notes.ilike.%${input.q}%`,
        );
      }
      if (input.cursor) {
        query = query.lt("created_at", input.cursor);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      let rows = (data ?? []) as ChefIdeaRow[];

      if (input.categoryIds?.length) {
        const { data: jc, error: jcErr } = await ctx.supabase
          .from("chef_idea_category")
          .select("chef_idea_id")
          .in("category_id", input.categoryIds);
        if (jcErr) throwFromPostgrest(jcErr);
        const allowed = new Set(
          (jc ?? []).map((r) => r.chef_idea_id as string),
        );
        rows = rows.filter((r) => allowed.has(r.id));
      }
      if (input.tagIds?.length) {
        const { data: jt, error: jtErr } = await ctx.supabase
          .from("chef_idea_tag")
          .select("chef_idea_id")
          .in("tag_id", input.tagIds);
        if (jtErr) throwFromPostgrest(jtErr);
        const allowed = new Set(
          (jt ?? []).map((r) => r.chef_idea_id as string),
        );
        rows = rows.filter((r) => allowed.has(r.id));
      }

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? page[page.length - 1]!.created_at
          : null;

      return {
        items: page.map(mapChefIdeaRow),
        nextCursor,
      };
    }),

  /** Detail by id â€” does not filter deleted_at (badge soft-deleted refs). */
  byId: authedProcedure
    .input(chefIdeaByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "ChefIdea not found");
      return mapChefIdeaRow(data as ChefIdeaRow);
    }),

  create: authedProcedure
    .input(chefIdeaCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = chefIdeaWriteFields({
        title: input.title,
        notes: input.notes,
        source: input.source,
        status: input.status,
        priority: input.priority,
        convertedRecipeId: input.convertedRecipeId,
      });

      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .insert({
          ...fields,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);

      const row = data as ChefIdeaRow;
      await replaceChefIdeaJunction(
        ctx.supabase,
        "chef_idea_category",
        "category_id",
        row.id,
        input.categoryIds,
      );
      await replaceChefIdeaJunction(
        ctx.supabase,
        "chef_idea_tag",
        "tag_id",
        row.id,
        input.tagIds,
      );

      return mapChefIdeaRow(row);
    }),

  update: authedProcedure
    .input(chefIdeaUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, categoryIds, tagIds, ...rest } = input;
      const fields = chefIdeaWriteFields(rest);

      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from("chef_idea")
          .update(fields)
          .eq("id", id)
          .is("deleted_at", null);
        if (error) throwFromPostgrest(error);
      }

      if (categoryIds !== undefined) {
        await replaceChefIdeaJunction(
          ctx.supabase,
          "chef_idea_category",
          "category_id",
          id,
          categoryIds,
        );
      }
      if (tagIds !== undefined) {
        await replaceChefIdeaJunction(
          ctx.supabase,
          "chef_idea_tag",
          "tag_id",
          id,
          tagIds,
        );
      }

      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "ChefIdea not found");
      return mapChefIdeaRow(data as ChefIdeaRow);
    }),

  setStatus: authedProcedure
    .input(chefIdeaSetStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .update({ status: input.status })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "ChefIdea not found");
      return mapChefIdeaRow(data as ChefIdeaRow);
    }),

  /**
   * Create a recipe from the idea (notes â†’ description), copy category/tag
   * junctions, set idea status=adopted and linked_recipe_id.
   * Sequential inserts under caller JWT; surface first error.
   * (A single RPC may replace this later for true atomicity.)
   */
  convertToRecipe: authedProcedure
    .input(chefIdeaConvertToRecipeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data: idea, error: ideaErr } = await ctx.supabase
        .from("chef_idea")
        .select("*")
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (ideaErr) throwFromPostgrest(ideaErr);
      assertFound(idea, "ChefIdea not found");
      const ideaRow = idea as ChefIdeaRow;

      if (ideaRow.linked_recipe_id) {
        const { data: existingRecipe, error: erErr } = await ctx.supabase
          .from("recipe")
          .select("*")
          .eq("id", ideaRow.linked_recipe_id)
          .maybeSingle();
        if (erErr) throwFromPostgrest(erErr);
        assertFound(existingRecipe, "Linked recipe not found");
        return {
          idea: mapChefIdeaRow(ideaRow),
          recipe: mapRecipeRow(existingRecipe as RecipeRow),
          alreadyConverted: true as const,
        };
      }

      const { data: cats } = await ctx.supabase
        .from("chef_idea_category")
        .select("category_id")
        .eq("chef_idea_id", input.id);
      const { data: tags } = await ctx.supabase
        .from("chef_idea_tag")
        .select("tag_id")
        .eq("chef_idea_id", input.id);

      const categoryIds = (cats ?? []).map((c) => c.category_id as string);
      const tagIds = (tags ?? []).map((t) => t.tag_id as string);

      const { data: recipe, error: recipeErr } = await ctx.supabase
        .from("recipe")
        .insert({
          title: input.title ?? ideaRow.title,
          description: input.description ?? ideaRow.notes,
          yield_servings: input.yieldServings ?? 1,
          instructions: [],
          leftover_decay_path: [],
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (recipeErr) throwFromPostgrest(recipeErr);
      const recipeRow = recipe as RecipeRow;

      if (categoryIds.length) {
        const { error } = await ctx.supabase.from("recipe_category").insert(
          categoryIds.map((category_id) => ({
            recipe_id: recipeRow.id,
            category_id,
          })),
        );
        if (error) throwFromPostgrest(error);
      }
      if (tagIds.length) {
        const { error } = await ctx.supabase.from("recipe_tag").insert(
          tagIds.map((tag_id) => ({
            recipe_id: recipeRow.id,
            tag_id,
          })),
        );
        if (error) throwFromPostgrest(error);
      }

      const { data: updatedIdea, error: updErr } = await ctx.supabase
        .from("chef_idea")
        .update({
          linked_recipe_id: recipeRow.id,
          status: "adopted",
        })
        .eq("id", input.id)
        .select("*")
        .single();
      if (updErr) throwFromPostgrest(updErr);

      return {
        idea: mapChefIdeaRow(updatedIdea as ChefIdeaRow),
        recipe: mapRecipeRow(recipeRow),
        alreadyConverted: false as const,
      };
    }),
});
```

### FILE: apps/web/src/app/(app)/recipes/[id]/page.tsx

```tsx
import { RecipeDetail } from "@/components/recipes/RecipeDetail";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RecipeDetail recipeId={id} />;
}
```

### FILE: apps/web/src/app/(app)/recipes/combinations/[id]/page.tsx

```tsx
/**
 * Combination detail (read-focused for Wave 2 content screens).
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import { useTRPC } from "@/lib/trpc/client";

export default function CombinationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const trpc = useTRPC();
  const query = useQuery(trpc.recipeCombination.byId.queryOptions({ id }));

  if (query.isLoading) {
    return <p className="text-sm text-zinc-500">Loading combinationâ€¦</p>;
  }
  if (query.isError || !query.data) {
    return (
      <p className="text-sm text-red-600" role="alert">
        Combination not found.
      </p>
    );
  }

  const combo = query.data;
  const recipes = [...(combo.recipes ?? [])].sort(
    (a, b) => a.sequenceOrder - b.sequenceOrder,
  );

  return (
    <article className="mx-auto max-w-xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-zinc-900">{combo.name}</h1>
        {combo.isTemplate ? (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
            Template
          </span>
        ) : null}
      </div>
      {combo.notes ? <p className="text-zinc-600">{combo.notes}</p> : null}
      {combo.makeAgainRating != null ? (
        <p className="text-sm text-zinc-500">â˜… {combo.makeAgainRating}</p>
      ) : null}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Courses
        </h2>
        <ol className="space-y-2">
          {recipes.map((r, i) => (
            <li
              key={`${r.recipeId}-${i}`}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <span className="font-medium text-zinc-800">
                {i + 1}.{" "}
                <Link
                  href={`/recipes/${r.recipeId}`}
                  className="text-emerald-700 underline"
                >
                  Recipe
                </Link>
              </span>
              {r.roleInMeal ? (
                <span className="ml-2 text-zinc-500">({r.roleInMeal})</span>
              ) : null}
              {r.notes ? (
                <p className="mt-1 text-zinc-600">{r.notes}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
```

### FILE: apps/web/src/app/(app)/ideas/[id]/page.tsx

```tsx
import { ChefIdeaDetail } from "@/components/ideas/ChefIdeaDetail";

export default async function IdeaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChefIdeaDetail ideaId={id} />;
}
```


