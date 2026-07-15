## NOTES

1. **Auth is invite-only:** /login supports password + magic link (`shouldCreateUser: false`). No signup UI.
2. **COORDINATOR: 0005 auth provisioning** markers on LoginForm, WaitingForInvite, SessionProvider, family router, app layout. Profile rows come from admin invite + SECURITY DEFINER hook.
3. **Waiting-for-invite:** `family.me` returns null when session exists but profile is missing (RLS empty). App shell renders WaitingForInvite — not an error state.
4. **family router:** thin reads for me/households/portionCategories/settings (required so all server data goes through tRPC).
5. **listRange extended** with assignments + recipeTitle (meal-slot ordered) so calendar can render slots without N+1 byId.
6. **Realtime:** `useRealtimePlanInvalidation` subscribe-only; 250ms debounce; never uses event payload. Tested via `createDebouncedInvalidator` seam.
7. **Portion grid:** live preview via `@menu-boss/portion-calc` only; athleteCount clamped ≤ count; deactivated categories read-only with badge (D11).
8. **Share checklist:** creating household checkbox checked + disabled always.
9. **Deps:** react-big-calendar + date-fns + portion-calc workspace; shadcn-style local UI primitives (no extra component library). Dev-only: testing-library, jsdom, pg.
10. **Extensionless relative imports** throughout.
11. **Placeholders** for /recipes /ideas /shopping (Task 12). Shopping accepts `?plans=` query from calendar CTA.
12. **Tests:** PortionGrid (clamp, deactivated badge, live total), ShareChecklist (creator disabled), invalidation debounce (fake timers).

<!-- TODO(coordinator): Confirm Supabase Realtime publication includes meal_plan* tables for postgres_changes. -->
<!-- TODO(coordinator): Confirm email OTP template + redirect allowlist for magic link in hosted Supabase. -->
<!-- COORDINATOR: 0005 auth provisioning -->

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
    "@menu-boss/portion-calc": "workspace:*",
    "@menu-boss/schemas": "workspace:*",
    "@supabase/ssr": "^0.12.1",
    "@supabase/supabase-js": "^2.110.4",
    "@tanstack/react-query": "^5.101.2",
    "@trpc/client": "^11.18.0",
    "@trpc/server": "^11.18.0",
    "@trpc/tanstack-react-query": "^11.18.0",
    "date-fns": "^4.1.0",
    "next": "16.2.10",
    "react": "19.2.4",
    "react-big-calendar": "^1.19.4",
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
    "@types/pg": "^8.20.0",
    "@types/react": "^19",
    "@types/react-big-calendar": "^1.16.3",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.10",
    "jsdom": "^29.1.1",
    "pg": "^8.22.0",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^3.2.7"
  }
}
```

### FILE: apps/web/tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules", "vitest.config.ts", "playwright.config.ts"]
}
```

### FILE: apps/web/vitest.config.ts
```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Unit + component tests. Playwright specs live in ./e2e.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
```

### FILE: apps/web/vitest.setup.ts
```ts
import "@testing-library/jest-dom/vitest";
```

### FILE: apps/web/src/lib/utils.ts
```ts
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
```

### FILE: apps/web/src/lib/supabase/client.ts
```ts
/**
 * Browser Supabase client (anon key + cookie session via @supabase/ssr).
 * Used by auth UI, session provider, and realtime subscriptions.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}
```

### FILE: apps/web/src/lib/supabase/server.ts
```ts
/**
 * Server Supabase client for RSC / route handlers (cookie-bound JWT).
 * Never uses the service-role key.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component cookie mutation may be disallowed; middleware refreshes.
          }
        },
      },
    },
  );
}
```

### FILE: apps/web/src/lib/supabase/middleware.ts
```ts
/**
 * Session refresh helper for Next.js middleware.
 * Keeps auth cookies fresh and returns a redirect response when needed.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** App routes that require an authenticated session. */
const PROTECTED_PREFIXES = [
  "/calendar",
  "/plans",
  "/recipes",
  "/ideas",
  "/shopping",
  "/waiting",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() validates JWT with Supabase Auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  const isLogin = path === "/login" || path.startsWith("/login/");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/calendar";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

### FILE: apps/web/src/middleware.ts
```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images.
     * Auth refresh runs on navigations; API trpc inherits cookies.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

### FILE: apps/web/src/trpc/client.ts
```ts
"use client";

/**
 * Browser tRPC client + React helpers (tRPC v11 + TanStack Query).
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers/_app";

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

export function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
      }),
    ],
  });
}
```

### FILE: apps/web/src/providers/AppProviders.tsx
```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { makeTRPCClient, TRPCProvider } from "@/trpc/client";
import { SessionProvider } from "@/providers/SessionProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => makeTRPCClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

### FILE: apps/web/src/providers/SessionProvider.tsx
```tsx
"use client";

/**
 * Supabase auth session context for client components.
 * <!-- COORDINATOR: 0005 auth provisioning -->
 * Profile provisioning is coordinator-owned; this provider only tracks auth.session.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type SessionContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, [supabase]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut,
    }),
    [session, loading, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
```

### FILE: apps/web/src/server/routers/family.ts
```ts
/**
 * family router — profile/me, households, portion categories, family settings.
 * Read-only surface for auth gate + MealPlan editor (Task 11).
 * Auth: JWT supabase client; RLS owns authorization.
 *
 * <!-- COORDINATOR: 0005 auth provisioning -->
 * Profile rows are provisioned by the admin invite flow + SECURITY DEFINER
 * auth hook (migration 0005). Callers without a profile row see empty me /
 * waiting-for-invite — not an error.
 */
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { authedProcedure, createTRPCRouter } from "../trpc";

export type ProfileDto = {
  id: string;
  householdId: string;
  displayName: string;
  role: "admin" | "member";
};

export type HouseholdDto = {
  id: string;
  name: string;
  familyId: string;
  isActive: boolean;
};

export type PortionCategoryDto = {
  id: string;
  name: string;
  slug: string;
  baseProteinOz: number;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type FamilySettingsDto = {
  id: string;
  athleteMultiplier: number;
};

export const familyRouter = createTRPCRouter({
  /**
   * Current user's profile + household.
   * Returns null when session is valid but no profile row exists
   * (waiting for family invite — RLS empty / is_family_member false).
   */
  me: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("profile")
      .select("id, household_id, display_name, role")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error) throwFromPostgrest(error);
    if (!data) return null;

    const { data: household, error: hhErr } = await ctx.supabase
      .from("household")
      .select("id, name, family_id, is_active")
      .eq("id", data.household_id as string)
      .maybeSingle();
    if (hhErr) throwFromPostgrest(hhErr);

    const profile: ProfileDto = {
      id: data.id as string,
      householdId: data.household_id as string,
      displayName: data.display_name as string,
      role: data.role as "admin" | "member",
    };

    const householdDto: HouseholdDto | null = household
      ? {
          id: household.id as string,
          name: household.name as string,
          familyId: household.family_id as string,
          isActive: Boolean(household.is_active),
        }
      : null;

    return { profile, household: householdDto };
  }),

  /** Active households in the family (share checklist). */
  households: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("household")
      .select("id, name, family_id, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throwFromPostgrest(error);
    return ((data ?? []) as Array<{
      id: string;
      name: string;
      family_id: string;
      is_active: boolean;
    }>).map(
      (h): HouseholdDto => ({
        id: h.id,
        name: h.name,
        familyId: h.family_id,
        isActive: h.is_active,
      }),
    );
  }),

  /**
   * Portion categories for the editor grid.
   * Includes inactive so historical plan rows can render read-only (D11).
   */
  portionCategories: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("portion_category")
      .select(
        "id, name, slug, base_protein_oz, description, sort_order, is_active",
      )
      .order("sort_order", { ascending: true });
    if (error) throwFromPostgrest(error);
    return ((data ?? []) as Array<{
      id: string;
      name: string;
      slug: string;
      base_protein_oz: number;
      description: string | null;
      sort_order: number;
      is_active: boolean;
    }>).map(
      (c): PortionCategoryDto => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        baseProteinOz: Number(c.base_protein_oz),
        description: c.description,
        sortOrder: c.sort_order,
        isActive: c.is_active,
      }),
    );
  }),

  settings: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("family_settings")
      .select("id, athlete_multiplier")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throwFromPostgrest(error);
    if (!data) {
      return { id: "", athleteMultiplier: 1.5 } satisfies FamilySettingsDto;
    }
    return {
      id: data.id as string,
      athleteMultiplier: Number(data.athlete_multiplier),
    } satisfies FamilySettingsDto;
  }),

  /** Convenience: assert profile exists (throws NOT_FOUND otherwise). */
  requireMe: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("profile")
      .select("id, household_id, display_name, role")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error) throwFromPostgrest(error);
    assertFound(data, "Profile not provisioned — waiting for family invite");
    return {
      id: data.id as string,
      householdId: data.household_id as string,
      displayName: data.display_name as string,
      role: data.role as "admin" | "member",
    } satisfies ProfileDto;
  }),
});
```

### FILE: apps/web/src/server/routers/_app.ts
```ts
/**
 * Root app router — Wave 1 content domain + Wave 2 mealPlan + family reads.
 */
import { createTRPCRouter } from "../trpc";
import { categoryRouter } from "./category";
import { chefIdeaRouter } from "./chefIdea";
import { familyRouter } from "./family";
import { healthRouter } from "./health";
import { ingredientRouter } from "./ingredient";
import { mealPlanRouter } from "./mealPlan";
import { recipeRouter } from "./recipe";
import { recipeCombinationRouter } from "./recipeCombination";
import { tagRouter } from "./tag";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  recipe: recipeRouter,
  ingredient: ingredientRouter,
  category: categoryRouter,
  tag: tagRouter,
  chefIdea: chefIdeaRouter,
  recipeCombination: recipeCombinationRouter,
  mealPlan: mealPlanRouter,
  family: familyRouter,
});

export type AppRouter = typeof appRouter;
```

### FILE: apps/web/src/server/routers/mealPlan.ts
```ts
/**
 * mealPlan router — household-visibility domain (D6 / D8).
 * Writes go through meal_plan_create_or_update RPC (atomic multi-table).
 * Auth: JWT supabase client; RLS owns authorization. No service role.
 */
import { calculateEffectiveProteinOz } from "@menu-boss/portion-calc";
import {
  mealPlanByIdInputSchema,
  mealPlanListRangeInputSchema,
  mealPlanShareInputSchema,
  mealPlanSoftDeleteInputSchema,
  mealPlanUnshareInputSchema,
  mealPlanUpsertInputSchema,
  proteinRollupQuerySchema,
  shoppingListQuerySchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import {
  authedProcedure,
  createTRPCRouter,
  type AppSupabaseClient,
} from "../trpc";
import {
  buildShoppingListDto,
  mapAssignmentRow,
  mapMealPlanRow,
  mapPortionRequirementRow,
  type MealPlanAssignmentRow,
  type MealPlanDetailDto,
  type MealPlanPortionRequirementRow,
  type MealPlanRow,
  type UnitRow,
} from "./mealPlanMapper";

type PortionCategoryRow = {
  id: string;
  slug: string;
  base_protein_oz: number;
  is_active: boolean;
};

async function loadFamilySettings(
  supabase: AppSupabaseClient,
): Promise<{ athleteMultiplier: number }> {
  const { data, error } = await supabase
    .from("family_settings")
    .select("athlete_multiplier")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throwFromPostgrest(error);
  return {
    athleteMultiplier: Number(data?.athlete_multiplier ?? 1.5),
  };
}

async function loadPortionCategories(
  supabase: AppSupabaseClient,
  ids: string[],
): Promise<PortionCategoryRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("portion_category")
    .select("id, slug, base_protein_oz, is_active")
    .in("id", ids);
  if (error) throwFromPostgrest(error);
  return (data ?? []) as PortionCategoryRow[];
}

function computeEffectiveProteinOz(
  requirements: MealPlanPortionRequirementRow[],
  categories: PortionCategoryRow[],
  athleteMultiplier: number,
): number {
  if (requirements.length === 0) return 0;
  return calculateEffectiveProteinOz(
    requirements.map((r) => ({
      portionCategoryId: r.portion_category_id,
      count: Number(r.count),
      athleteCount: Number(r.athlete_count),
    })),
    categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      baseProteinOz: Number(c.base_protein_oz),
      isActive: c.is_active,
    })),
    { athleteMultiplier },
  );
}

async function loadPlanDetail(
  supabase: AppSupabaseClient,
  planId: string,
): Promise<MealPlanDetailDto> {
  const { data: plan, error } = await supabase
    .from("meal_plan")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throwFromPostgrest(error);
  assertFound(plan, "Meal plan not found");

  const { data: households, error: hhErr } = await supabase
    .from("meal_plan_household")
    .select("household_id")
    .eq("meal_plan_id", planId);
  if (hhErr) throwFromPostgrest(hhErr);

  const { data: portions, error: prErr } = await supabase
    .from("meal_plan_portion_requirement")
    .select("*")
    .eq("meal_plan_id", planId);
  if (prErr) throwFromPostgrest(prErr);

  const { data: assignments, error: asErr } = await supabase
    .from("meal_plan_assignment")
    .select("*")
    .eq("meal_plan_id", planId)
    .order("assignment_date", { ascending: true });
  if (asErr) throwFromPostgrest(asErr);

  const portionRows = (portions ?? []) as MealPlanPortionRequirementRow[];
  const categoryIds = portionRows.map((p) => p.portion_category_id);
  const [categories, settings] = await Promise.all([
    loadPortionCategories(supabase, categoryIds),
    loadFamilySettings(supabase),
  ]);

  const householdIds = (households ?? []).map(
    (h) => h.household_id as string,
  );

  return {
    ...mapMealPlanRow(plan as MealPlanRow),
    householdIds,
    isShared: householdIds.length > 1,
    portionRequirements: portionRows.map(mapPortionRequirementRow),
    assignments: ((assignments ?? []) as MealPlanAssignmentRow[]).map(
      mapAssignmentRow,
    ),
    effectiveProteinOz: computeEffectiveProteinOz(
      portionRows,
      categories,
      settings.athleteMultiplier,
    ),
  };
}

export const mealPlanRouter = createTRPCRouter({
  /**
   * Atomic create/update via meal_plan_create_or_update RPC.
   * Maps SQLSTATE 42501 → FORBIDDEN, 23514 → BAD_REQUEST.
   */
  upsert: authedProcedure
    .input(mealPlanUpsertInputSchema)
    .mutation(async ({ ctx, input }) => {
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        title: input.title,
        description: input.description ?? null,
        startDate: input.startDate.slice(0, 10),
        endDate: input.endDate.slice(0, 10),
        householdIds: input.householdIds,
        portionRequirements: input.portionRequirements.map((r) => ({
          portionCategoryId: r.portionCategoryId,
          count: r.count,
          athleteCount: r.athleteCount,
        })),
        assignments: input.assignments.map((a) => ({
          ...(a.id ? { id: a.id } : {}),
          recipeId: a.recipeId,
          assignmentDate: a.assignmentDate.slice(0, 10),
          mealSlot: a.mealSlot,
          servings: a.servings,
          notes: a.notes ?? null,
        })),
      };

      const { data: planId, error } = await ctx.supabase.rpc(
        "meal_plan_create_or_update",
        { p_payload: payload },
      );
      if (error) throwFromPostgrest(error);
      assertFound(planId, "Meal plan upsert returned no id");

      return loadPlanDetail(ctx.supabase, planId as string);
    }),

  byId: authedProcedure
    .input(mealPlanByIdInputSchema)
    .query(async ({ ctx, input }) => {
      return loadPlanDetail(ctx.supabase, input.id);
    }),

  /**
   * Plans overlapping [start, end] with deleted_at IS NULL.
   * isShared derived from membership count > 1; effectiveProteinOz via portion-calc.
   */
  listRange: authedProcedure
    .input(mealPlanListRangeInputSchema)
    .query(async ({ ctx, input }) => {
      const start = input.start.slice(0, 10);
      const end = input.end.slice(0, 10);

      const { data, error } = await ctx.supabase
        .from("meal_plan")
        .select("*")
        .is("deleted_at", null)
        .lte("start_date", end)
        .gte("end_date", start)
        .order("start_date", { ascending: true });
      if (error) throwFromPostgrest(error);

      const plans = (data ?? []) as MealPlanRow[];
      if (plans.length === 0) return [];

      const planIds = plans.map((p) => p.id);

      const { data: memberships, error: mErr } = await ctx.supabase
        .from("meal_plan_household")
        .select("meal_plan_id, household_id")
        .in("meal_plan_id", planIds);
      if (mErr) throwFromPostgrest(mErr);

      const { data: portions, error: pErr } = await ctx.supabase
        .from("meal_plan_portion_requirement")
        .select("*")
        .in("meal_plan_id", planIds);
      if (pErr) throwFromPostgrest(pErr);

      // Calendar needs assignment slots inside plan day cells (Task 11).
      const { data: assignmentRows, error: aErr } = await ctx.supabase
        .from("meal_plan_assignment")
        .select("*")
        .in("meal_plan_id", planIds)
        .order("assignment_date", { ascending: true });
      if (aErr) throwFromPostgrest(aErr);

      const assignments =
        (assignmentRows ?? []) as MealPlanAssignmentRow[];
      const recipeIds = [
        ...new Set(assignments.map((a) => a.recipe_id)),
      ];
      const recipeTitleById = new Map<string, string>();
      if (recipeIds.length > 0) {
        const { data: recipes, error: rErr } = await ctx.supabase
          .from("recipe")
          .select("id, title")
          .in("id", recipeIds);
        if (rErr) throwFromPostgrest(rErr);
        for (const r of recipes ?? []) {
          recipeTitleById.set(r.id as string, r.title as string);
        }
      }

      const portionRows = (portions ?? []) as MealPlanPortionRequirementRow[];
      const categoryIds = [
        ...new Set(portionRows.map((p) => p.portion_category_id)),
      ];
      const [categories, settings] = await Promise.all([
        loadPortionCategories(ctx.supabase, categoryIds),
        loadFamilySettings(ctx.supabase),
      ]);

      const hhByPlan = new Map<string, string[]>();
      for (const m of memberships ?? []) {
        const pid = m.meal_plan_id as string;
        const list = hhByPlan.get(pid) ?? [];
        list.push(m.household_id as string);
        hhByPlan.set(pid, list);
      }

      const portionsByPlan = new Map<string, MealPlanPortionRequirementRow[]>();
      for (const pr of portionRows) {
        const list = portionsByPlan.get(pr.meal_plan_id) ?? [];
        list.push(pr);
        portionsByPlan.set(pr.meal_plan_id, list);
      }

      const assignmentsByPlan = new Map<string, MealPlanAssignmentRow[]>();
      for (const a of assignments) {
        const list = assignmentsByPlan.get(a.meal_plan_id) ?? [];
        list.push(a);
        assignmentsByPlan.set(a.meal_plan_id, list);
      }

      const mealSlotOrder = (slot: string) => {
        const order: Record<string, number> = {
          breakfast: 0,
          lunch: 1,
          dinner: 2,
          snack: 3,
        };
        return order[slot.toLowerCase()] ?? 50;
      };

      return plans.map((plan) => {
        const householdIds = hhByPlan.get(plan.id) ?? [];
        const prs = portionsByPlan.get(plan.id) ?? [];
        const planAssignments = (assignmentsByPlan.get(plan.id) ?? [])
          .slice()
          .sort((a, b) => {
            const byDate = a.assignment_date.localeCompare(b.assignment_date);
            if (byDate !== 0) return byDate;
            return mealSlotOrder(a.meal_slot) - mealSlotOrder(b.meal_slot);
          })
          .map((a) => ({
            ...mapAssignmentRow(a),
            recipeTitle: recipeTitleById.get(a.recipe_id) ?? "Recipe",
          }));
        return {
          ...mapMealPlanRow(plan),
          householdIds,
          isShared: householdIds.length > 1,
          portionRequirements: prs.map(mapPortionRequirementRow),
          assignments: planAssignments,
          effectiveProteinOz: computeEffectiveProteinOz(
            prs,
            categories,
            settings.athleteMultiplier,
          ),
        };
      });
    }),

  /**
   * Wrapper over generate_shopping_list + display-unit formatting.
   * Largest unit ≥ 1 in dimension; cross-dimension under one ingredient heading;
   * Optional group separated.
   */
  generateShoppingList: authedProcedure
    .input(shoppingListQuerySchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("generate_shopping_list", {
        p_meal_plan_ids: input.mealPlanIds,
      });
      if (error) throwFromPostgrest(error);

      const { data: units, error: uErr } = await ctx.supabase
        .from("unit")
        .select("id, name, abbreviation, dimension, factor_to_base, is_active, sort_order")
        .eq("is_active", true);
      if (uErr) throwFromPostgrest(uErr);

      return buildShoppingListDto(
        (data ?? []) as Array<{
          ingredient_id: string;
          ingredient_name: string;
          dimension: string;
          total_quantity_base: number | null;
          is_optional: boolean;
          category_name: string | null;
          source_recipe_ids: string[] | null;
          includes_deleted_recipe: boolean;
        }>,
        (units ?? []) as UnitRow[],
      );
    }),

  proteinRollup: authedProcedure
    .input(proteinRollupQuerySchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("weekly_protein_rollup", {
        p_start: input.start.slice(0, 10),
        p_end: input.end.slice(0, 10),
      });
      if (error) throwFromPostgrest(error);

      return ((data ?? []) as Array<{
        meal_plan_id: string;
        title: string;
        start_date: string;
        end_date: string;
        effective_protein_oz: number;
      }>).map((r) => ({
        mealPlanId: r.meal_plan_id,
        title: r.title,
        startDate: r.start_date,
        endDate: r.end_date,
        effectiveProteinOz: Number(r.effective_protein_oz),
      }));
    }),

  softDelete: authedProcedure
    .input(mealPlanSoftDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("meal_plan")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Meal plan not found or already deleted");
      return mapMealPlanRow(data as MealPlanRow);
    }),

  /** Single-row share — insert meal_plan_household (no RPC needed). */
  share: authedProcedure
    .input(mealPlanShareInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("meal_plan_household").insert({
        meal_plan_id: input.mealPlanId,
        household_id: input.householdId,
        added_by_user_id: ctx.userId,
      });
      if (error) throwFromPostgrest(error);
      return loadPlanDetail(ctx.supabase, input.mealPlanId);
    }),

  /** Single-row unshare — delete meal_plan_household (creator row blocked by RLS). */
  unshare: authedProcedure
    .input(mealPlanUnshareInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { error, count } = await ctx.supabase
        .from("meal_plan_household")
        .delete({ count: "exact" })
        .eq("meal_plan_id", input.mealPlanId)
        .eq("household_id", input.householdId);
      if (error) throwFromPostgrest(error);
      if (count === 0) {
        // Could be creator-row protection or missing membership — fail closed.
        assertFound(null, "Membership not found or cannot be removed");
      }
      return loadPlanDetail(ctx.supabase, input.mealPlanId);
    }),
});
```

### FILE: apps/web/src/components/ui/button.tsx
```tsx
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "default" &&
          "bg-emerald-700 text-white hover:bg-emerald-800",
        variant === "outline" &&
          "border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-900",
        variant === "ghost" && "hover:bg-zinc-100 text-zinc-900",
        variant === "destructive" &&
          "bg-red-600 text-white hover:bg-red-700",
        size === "default" && "h-10 px-4 py-2",
        size === "sm" && "h-8 rounded-md px-3 text-xs",
        size === "lg" && "h-11 rounded-md px-8",
        size === "icon" && "h-9 w-9",
        className,
      )}
      {...props}
    />
  );
}
```

### FILE: apps/web/src/components/ui/input.tsx
```tsx
import { cn } from "@/lib/utils";

export function Input({
  className,
  type = "text",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm",
        "placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
```

### FILE: apps/web/src/components/ui/label.tsx
```tsx
import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-sm font-medium leading-none text-zinc-800 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}
```

### FILE: apps/web/src/components/ui/badge.tsx
```tsx
import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium",
        "bg-zinc-100 text-zinc-700",
        className,
      )}
      {...props}
    />
  );
}
```

### FILE: apps/web/src/components/ui/card.tsx
```tsx
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1.5 p-4 sm:p-6", className)} {...props} />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}
```

### FILE: apps/web/src/components/auth/LoginForm.tsx
```tsx
"use client";

/**
 * /login — magic link + password sign-in. No signup / self-registration.
 * <!-- COORDINATOR: 0005 auth provisioning -->
 */
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "password" | "magic";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/calendar";

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    const supabase = createClient();

    try {
      if (mode === "password") {
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signErr) {
          setError(signErr.message);
          return;
        }
        router.replace(next);
        router.refresh();
        return;
      }

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/calendar`,
          // No self-signup: only existing auth users receive a link.
          shouldCreateUser: false,
        },
      });
      if (otpErr) {
        setError(otpErr.message);
        return;
      }
      setMessage("Check your email for a magic link to sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in to MenuBoss</CardTitle>
        <p className="text-sm text-zinc-500">
          Family accounts are invite-only. No self-registration.
        </p>
      </CardHeader>
      <CardContent>
        <div
          className="mb-4 flex gap-2"
          role="tablist"
          aria-label="Sign-in method"
        >
          <Button
            role="tab"
            aria-selected={mode === "password"}
            variant={mode === "password" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("password")}
          >
            Password
          </Button>
          <Button
            role="tab"
            aria-selected={mode === "magic"}
            variant={mode === "magic" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("magic")}
          >
            Magic link
          </Button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode === "password" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="text-sm text-emerald-700" role="status">
              {message}
            </p>
          )}

          <Button type="submit" disabled={pending}>
            {pending
              ? "Please wait…"
              : mode === "password"
                ? "Sign in"
                : "Send magic link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

### FILE: apps/web/src/components/auth/WaitingForInvite.tsx
```tsx
"use client";

/**
 * Shown when auth.session exists but profile row is missing (RLS empty).
 * <!-- COORDINATOR: 0005 auth provisioning -->
 */
import { useSession } from "@/providers/SessionProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WaitingForInvite() {
  const { user, signOut } = useSession();

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Waiting for family invite</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600">
            You&apos;re signed in
            {user?.email ? (
              <>
                {" "}
                as <strong>{user.email}</strong>
              </>
            ) : null}
            , but your profile hasn&apos;t been provisioned yet. Ask a family
            admin to invite you. Once your account is linked to a household,
            MenuBoss will unlock automatically.
          </p>
          <p className="text-xs text-zinc-400">
            {/* COORDINATOR: 0005 auth provisioning */}
            Profile rows are created by the admin invite flow (migration 0005).
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                window.location.reload();
              }}
            >
              Check again
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### FILE: apps/web/src/hooks/useRealtimePlanInvalidation.ts
```ts
"use client";

/**
 * Notify-then-refetch realtime wiring for meal plans (DB PRD v0.4 §7).
 *
 * Clients subscribe to postgres_changes on meal_plan* tables but treat
 * events ONLY as invalidation signals. On any event: debounce 250ms, then
 * invalidate TanStack Query caches for the visible range and refetch via
 * normal RLS-filtered tRPC queries.
 *
 * NEVER render payload data from the realtime event itself.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useTRPC } from "@/trpc/client";

export type DateRange = {
  start: string;
  end: string;
};

const MEAL_PLAN_TABLES = [
  "meal_plan",
  "meal_plan_assignment",
  "meal_plan_household",
  "meal_plan_portion_requirement",
] as const;

const DEBOUNCE_MS = 250;

/**
 * Subscribe to meal_plan* changes and invalidate listRange + proteinRollup
 * for the given visible range (and any byId caches).
 */
export function useRealtimePlanInvalidation(range: DateRange | null) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  useEffect(() => {
    if (!range) return;

    const supabase = createClient();

    const invalidate = () => {
      const r = rangeRef.current;
      if (!r) return;

      // Invalidate only through query keys — never touch event payloads.
      void queryClient.invalidateQueries({
        queryKey: trpc.mealPlan.listRange.queryKey({
          start: r.start,
          end: r.end,
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.mealPlan.proteinRollup.queryKey({
          start: r.start,
          end: r.end,
        }),
      });
      // Broad byId / list invalidation so open editors refresh safely.
      void queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey;
          if (!Array.isArray(key)) return false;
          // tRPC v11 keys typically nest path segments; match mealPlan loosely.
          return JSON.stringify(key).includes("mealPlan");
        },
      });
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        invalidate();
      }, DEBOUNCE_MS);
    };

    const channel = supabase.channel(`meal-plan-invalidate-${range.start}-${range.end}`);

    for (const table of MEAL_PLAN_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        // Intentionally ignore payload — notify-then-refetch only.
        () => {
          schedule();
        },
      );
    }

    channel.subscribe();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [range?.start, range?.end, queryClient, trpc]);
}

/** Test seam: pure debounce scheduler used by unit tests. */
export function createDebouncedInvalidator(
  invalidate: () => void,
  debounceMs = DEBOUNCE_MS,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    notify() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        invalidate();
      }, debounceMs);
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
```

### FILE: apps/web/src/hooks/useRealtimePlanInvalidation.test.ts
```ts
/**
 * Debounced invalidation unit tests (fake timers).
 * Full channel wiring is covered by E2E; here we prove the debounce seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedInvalidator } from "./useRealtimePlanInvalidation";

describe("createDebouncedInvalidator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces bursts to a single invalidate after 250ms", () => {
    const invalidate = vi.fn();
    const inv = createDebouncedInvalidator(invalidate, 250);

    inv.notify();
    inv.notify();
    inv.notify();

    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(249);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledTimes(1);

    inv.dispose();
  });

  it("resets the debounce window on each notify", () => {
    const invalidate = vi.fn();
    const inv = createDebouncedInvalidator(invalidate, 250);

    inv.notify();
    vi.advanceTimersByTime(200);
    inv.notify();
    vi.advanceTimersByTime(200);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(invalidate).toHaveBeenCalledTimes(1);

    inv.dispose();
  });

  it("dispose cancels a pending invalidate", () => {
    const invalidate = vi.fn();
    const inv = createDebouncedInvalidator(invalidate, 250);
    inv.notify();
    inv.dispose();
    vi.advanceTimersByTime(500);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never receives event payloads (notify takes no args)", () => {
    const invalidate = vi.fn();
    const inv = createDebouncedInvalidator(invalidate, 250);
    // Signature is notify(): void — callers must not pass payloads.
    inv.notify();
    vi.advanceTimersByTime(250);
    expect(invalidate).toHaveBeenCalledWith();
    inv.dispose();
  });
});
```

### FILE: apps/web/src/components/meal-plan/PortionGrid.tsx
```tsx
"use client";

/**
 * Portion grid: one row per PortionCategory with count / athleteCount steppers.
 * Live protein preview via @menu-boss/portion-calc (no server round-trip).
 * Deactivated categories with existing rows render read-only (D11).
 */
import { useMemo } from "react";
import {
  calculateEffectiveProteinOz,
  calculatePerCategoryBreakdown,
  roundOz,
  type PortionCategoryRef,
} from "@menu-boss/portion-calc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PortionRequirementValue = {
  portionCategoryId: string;
  count: number;
  athleteCount: number;
};

export type PortionCategoryOption = {
  id: string;
  name: string;
  slug: string;
  baseProteinOz: number;
  isActive: boolean;
};

export type PortionGridProps = {
  categories: PortionCategoryOption[];
  value: PortionRequirementValue[];
  onChange: (next: PortionRequirementValue[]) => void;
  athleteMultiplier?: number;
  /** When true, all steppers disabled (e.g. read-only shared plan). */
  readOnly?: boolean;
  className?: string;
};

function clampAthlete(count: number, athleteCount: number): number {
  return Math.max(0, Math.min(athleteCount, count));
}

function upsertRequirement(
  rows: PortionRequirementValue[],
  portionCategoryId: string,
  patch: Partial<Pick<PortionRequirementValue, "count" | "athleteCount">>,
): PortionRequirementValue[] {
  const idx = rows.findIndex((r) => r.portionCategoryId === portionCategoryId);
  if (idx < 0) {
    const count = patch.count ?? 0;
    const athleteCount = clampAthlete(count, patch.athleteCount ?? 0);
    if (count === 0 && athleteCount === 0) return rows;
    return [...rows, { portionCategoryId, count, athleteCount }];
  }
  const current = rows[idx]!;
  const count = patch.count ?? current.count;
  const athleteCount = clampAthlete(
    count,
    patch.athleteCount ?? current.athleteCount,
  );
  if (count === 0 && athleteCount === 0) {
    return rows.filter((_, i) => i !== idx);
  }
  const next = rows.slice();
  next[idx] = { portionCategoryId, count, athleteCount };
  return next;
}

export function PortionGrid({
  categories,
  value,
  onChange,
  athleteMultiplier = 1.5,
  readOnly = false,
  className,
}: PortionGridProps) {
  const byId = useMemo(() => {
    const m = new Map(value.map((r) => [r.portionCategoryId, r]));
    return m;
  }, [value]);

  // Active categories always shown; inactive only if they have a requirement row.
  const rows = useMemo(() => {
    const active = categories.filter((c) => c.isActive);
    const inactiveWithData = categories.filter(
      (c) => !c.isActive && byId.has(c.id),
    );
    return [...active, ...inactiveWithData];
  }, [categories, byId]);

  const categoryRefs: PortionCategoryRef[] = useMemo(
    () =>
      categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        baseProteinOz: c.baseProteinOz,
        isActive: c.isActive,
      })),
    [categories],
  );

  const requirements = useMemo(
    () =>
      value.map((r) => ({
        portionCategoryId: r.portionCategoryId,
        count: r.count,
        athleteCount: r.athleteCount,
      })),
    [value],
  );

  const preview = useMemo(() => {
    try {
      const settings = { athleteMultiplier };
      const total = calculateEffectiveProteinOz(
        requirements,
        categoryRefs,
        settings,
      );
      const breakdown = calculatePerCategoryBreakdown(
        requirements,
        categoryRefs,
        settings,
      );
      return { total, breakdown, error: null as string | null };
    } catch (err) {
      return {
        total: 0,
        breakdown: [],
        error: err instanceof Error ? err.message : "Preview unavailable",
      };
    }
  }, [requirements, categoryRefs, athleteMultiplier]);

  function setCount(categoryId: string, count: number) {
    if (readOnly) return;
    const nextCount = Math.max(0, count);
    onChange(
      upsertRequirement(value, categoryId, {
        count: nextCount,
      }),
    );
  }

  function setAthleteCount(categoryId: string, athleteCount: number) {
    if (readOnly) return;
    const current = byId.get(categoryId);
    const count = current?.count ?? 0;
    onChange(
      upsertRequirement(value, categoryId, {
        count,
        athleteCount: clampAthlete(count, Math.max(0, athleteCount)),
      }),
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Category
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Count
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Athletes
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Oz
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cat) => {
              const req = byId.get(cat.id);
              const count = req?.count ?? 0;
              const athleteCount = req?.athleteCount ?? 0;
              const deactivated = !cat.isActive;
              const rowReadOnly = readOnly || deactivated;
              const line = preview.breakdown.find(
                (b) => b.portionCategoryId === cat.id,
              );

              return (
                <tr
                  key={cat.id}
                  className={cn(
                    "border-t border-zinc-100",
                    deactivated && "bg-zinc-50/80",
                  )}
                  data-testid={`portion-row-${cat.slug}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-900">
                        {cat.name}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {cat.baseProteinOz} oz
                      </span>
                      {deactivated && (
                        <Badge
                          className="border-amber-200 bg-amber-50 text-amber-800"
                          data-testid="deactivated-badge"
                        >
                          deactivated
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Stepper
                      ariaLabel={`${cat.name} count`}
                      value={count}
                      disabled={rowReadOnly}
                      onChange={(n) => setCount(cat.id, n)}
                      testId={`count-stepper-${cat.slug}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Stepper
                      ariaLabel={`${cat.name} athlete count`}
                      value={athleteCount}
                      max={count}
                      disabled={rowReadOnly}
                      onChange={(n) => setAthleteCount(cat.id, n)}
                      testId={`athlete-stepper-${cat.slug}`}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-700">
                    {line ? roundOz(line.effectiveOz) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm"
        data-testid="portion-preview"
        aria-live="polite"
      >
        <span className="font-medium text-emerald-900">Live protein total</span>
        <span
          className="text-lg font-semibold tabular-nums text-emerald-800"
          data-testid="portion-total"
        >
          {preview.error ? "—" : `${roundOz(preview.total)} oz`}
        </span>
      </div>
      {preview.error && (
        <p className="text-xs text-red-600" role="alert">
          {preview.error}
        </p>
      )}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  disabled,
  max,
  ariaLabel,
  testId,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  max?: number;
  ariaLabel: string;
  testId?: string;
}) {
  const atMax = max !== undefined && value >= max;

  return (
    <div
      className="inline-flex items-center gap-1"
      data-testid={testId}
      role="group"
      aria-label={ariaLabel}
    >
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8"
        disabled={disabled || value <= 0}
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(value - 1)}
      >
        −
      </Button>
      <span
        className="min-w-8 text-center tabular-nums"
        aria-live="polite"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {value}
      </span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8"
        disabled={disabled || atMax}
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => onChange(value + 1)}
      >
        +
      </Button>
    </div>
  );
}

/** Pure clamp helper exported for unit tests. */
export function clampAthleteCount(count: number, athleteCount: number): number {
  return clampAthlete(count, athleteCount);
}
```

### FILE: apps/web/src/components/meal-plan/PortionGrid.test.tsx
```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PortionGrid,
  clampAthleteCount,
  type PortionCategoryOption,
  type PortionRequirementValue,
} from "./PortionGrid";

const CATS: PortionCategoryOption[] = [
  {
    id: "cat-male",
    name: "Adult Male",
    slug: "adult-male",
    baseProteinOz: 6,
    isActive: true,
  },
  {
    id: "cat-female",
    name: "Adult Female",
    slug: "adult-female",
    baseProteinOz: 5,
    isActive: true,
  },
  {
    id: "cat-old",
    name: "Legacy Group",
    slug: "legacy-group",
    baseProteinOz: 4,
    isActive: false,
  },
];

function Controlled({
  initial = [] as PortionRequirementValue[],
  categories = CATS,
}: {
  initial?: PortionRequirementValue[];
  categories?: PortionCategoryOption[];
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <PortionGrid
      categories={categories}
      value={value}
      onChange={setValue}
      athleteMultiplier={1.5}
    />
  );
}

// React import for useState in Controlled
import * as React from "react";

describe("clampAthleteCount", () => {
  it("clamps athleteCount to count", () => {
    expect(clampAthleteCount(2, 5)).toBe(2);
    expect(clampAthleteCount(3, 1)).toBe(1);
    expect(clampAthleteCount(0, 2)).toBe(0);
  });
});

describe("PortionGrid", () => {
  it("shows deactivated badge for inactive categories with data", () => {
    render(
      <PortionGrid
        categories={CATS}
        value={[
          { portionCategoryId: "cat-old", count: 1, athleteCount: 0 },
        ]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("deactivated-badge")).toHaveTextContent(
      "deactivated",
    );
    // Stepper buttons disabled for deactivated row
    const dec = screen.getByLabelText("Decrease Legacy Group count");
    expect(dec).toBeDisabled();
  });

  it("does not show inactive categories without requirement rows", () => {
    render(
      <PortionGrid categories={CATS} value={[]} onChange={vi.fn()} />,
    );
    expect(screen.queryByText("Legacy Group")).toBeNull();
    expect(screen.getByText("Adult Male")).toBeTruthy();
  });

  it("clamps athlete steppers to count in the UI", async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    // Increase Adult Male count to 1
    await user.click(screen.getByLabelText("Increase Adult Male count"));
    expect(screen.getByTestId("count-stepper-adult-male-value")).toHaveTextContent(
      "1",
    );

    // Increase athlete once → 1
    await user.click(
      screen.getByLabelText("Increase Adult Male athlete count"),
    );
    expect(
      screen.getByTestId("athlete-stepper-adult-male-value"),
    ).toHaveTextContent("1");

    // Cannot go above count
    const incAthlete = screen.getByLabelText(
      "Increase Adult Male athlete count",
    );
    expect(incAthlete).toBeDisabled();
  });

  it("updates live protein total when counts change", async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    // 0 people → 0 oz
    expect(screen.getByTestId("portion-total")).toHaveTextContent("0 oz");

    // 2 adult males × 6 oz = 12
    await user.click(screen.getByLabelText("Increase Adult Male count"));
    await user.click(screen.getByLabelText("Increase Adult Male count"));
    expect(screen.getByTestId("portion-total")).toHaveTextContent("12 oz");

    // 1 athlete: (1 + 1*1.5) * 6 = 15
    await user.click(
      screen.getByLabelText("Increase Adult Male athlete count"),
    );
    expect(screen.getByTestId("portion-total")).toHaveTextContent("15 oz");
  });
});
```

### FILE: apps/web/src/components/meal-plan/ShareChecklist.tsx
```tsx
"use client";

/**
 * Household sharing checklist.
 * Creating household is always checked + disabled (irremovable).
 */
import { cn } from "@/lib/utils";

export type HouseholdOption = {
  id: string;
  name: string;
  isActive?: boolean;
};

export type ShareChecklistProps = {
  households: HouseholdOption[];
  /** Creating household id — always included, checkbox disabled. */
  creatorHouseholdId: string;
  value: string[];
  onChange: (householdIds: string[]) => void;
  disabled?: boolean;
  className?: string;
};

export function ShareChecklist({
  households,
  creatorHouseholdId,
  value,
  onChange,
  disabled = false,
  className,
}: ShareChecklistProps) {
  const selected = new Set(value);

  // Creator always present in selection for display consistency.
  if (!selected.has(creatorHouseholdId)) {
    selected.add(creatorHouseholdId);
  }

  function toggle(id: string, checked: boolean) {
    if (disabled || id === creatorHouseholdId) return;
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    // Creator is always retained.
    next.add(creatorHouseholdId);
    onChange([...next]);
  }

  return (
    <fieldset
      className={cn("flex flex-col gap-2", className)}
      data-testid="share-checklist"
    >
      <legend className="text-sm font-medium text-zinc-800">
        Share with households
      </legend>
      <p className="text-xs text-zinc-500">
        Your household is always included and cannot be removed.
      </p>
      <ul className="flex flex-col gap-2">
        {households.map((h) => {
          const isCreator = h.id === creatorHouseholdId;
          const isChecked = selected.has(h.id);
          return (
            <li key={h.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm",
                  isCreator && "bg-zinc-50",
                  disabled && "cursor-not-allowed opacity-60",
                )}
                data-testid={
                  isCreator
                    ? "share-row-creator"
                    : `share-row-${h.id}`
                }
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
                  checked={isChecked}
                  disabled={disabled || isCreator}
                  onChange={(e) => toggle(h.id, e.target.checked)}
                  data-testid={
                    isCreator
                      ? "share-checkbox-creator"
                      : `share-checkbox-${h.id}`
                  }
                />
                <span className="font-medium text-zinc-900">{h.name}</span>
                {isCreator && (
                  <span className="text-xs text-zinc-500">(your household)</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
```

### FILE: apps/web/src/components/meal-plan/ShareChecklist.test.tsx
```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareChecklist } from "./ShareChecklist";

const HOUSEHOLDS = [
  { id: "hh-a", name: "Household A" },
  { id: "hh-b", name: "Household B" },
  { id: "hh-c", name: "Household C" },
];

describe("ShareChecklist", () => {
  it("disables the creator household checkbox", () => {
    render(
      <ShareChecklist
        households={HOUSEHOLDS}
        creatorHouseholdId="hh-a"
        value={["hh-a"]}
        onChange={vi.fn()}
      />,
    );
    const creator = screen.getByTestId("share-checkbox-creator");
    expect(creator).toBeDisabled();
    expect(creator).toBeChecked();
    expect(screen.getByTestId("share-row-creator")).toHaveTextContent(
      "your household",
    );
  });

  it("toggles non-creator households and always keeps creator", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ShareChecklist
        households={HOUSEHOLDS}
        creatorHouseholdId="hh-a"
        value={["hh-a"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("share-checkbox-hh-b"));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as string[];
    expect(next).toContain("hh-a");
    expect(next).toContain("hh-b");
  });

  it("does not fire onChange when clicking the creator row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ShareChecklist
        households={HOUSEHOLDS}
        creatorHouseholdId="hh-a"
        value={["hh-a", "hh-b"]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("share-checkbox-creator"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

### FILE: apps/web/src/components/meal-plan/MealPlanEditor.tsx
```tsx
"use client";

/**
 * MealPlan editor — RHF + mealPlanUpsertInput Zod, portion grid, share checklist.
 * Save via mealPlan.upsert; maps FORBIDDEN/BAD_REQUEST to inline messages.
 */
import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  mealPlanUpsertInputSchema,
  type MealPlanUpsertInput,
} from "@menu-boss/schemas";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PortionGrid,
  type PortionRequirementValue,
} from "@/components/meal-plan/PortionGrid";
import { ShareChecklist } from "@/components/meal-plan/ShareChecklist";
import { toIsoDate } from "@/lib/utils";

const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export type MealPlanEditorProps = {
  /** Existing plan id for edit; omit for create. */
  planId?: string;
  /** Prefill start date (e.g. from calendar day tap). */
  defaultStartDate?: string;
  defaultEndDate?: string;
};

type FormValues = MealPlanUpsertInput;

export function MealPlanEditor({
  planId,
  defaultStartDate,
  defaultEndDate,
}: MealPlanEditorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const meQuery = useQuery(trpc.family.me.queryOptions());
  const householdsQuery = useQuery(trpc.family.households.queryOptions());
  const categoriesQuery = useQuery(
    trpc.family.portionCategories.queryOptions(),
  );
  const settingsQuery = useQuery(trpc.family.settings.queryOptions());
  const planQuery = useQuery({
    ...trpc.mealPlan.byId.queryOptions({ id: planId! }),
    enabled: Boolean(planId),
  });

  const creatorHouseholdId =
    planQuery.data?.createdByHouseholdId ??
    meQuery.data?.profile.householdId ??
    "";

  const today = toIsoDate(new Date());
  const startDefault = defaultStartDate ?? today;
  const endDefault = defaultEndDate ?? defaultStartDate ?? today;

  const form = useForm<FormValues>({
    // zodResolver + .default() fields can widen; cast keeps RHF happy.
    resolver: zodResolver(mealPlanUpsertInputSchema) as never,
    defaultValues: {
      title: "",
      description: "",
      startDate: startDefault,
      endDate: endDefault,
      householdIds: creatorHouseholdId ? [creatorHouseholdId] : [],
      portionRequirements: [],
      assignments: [],
    },
  });

  const {
    fields: assignmentFields,
    append: appendAssignment,
    remove: removeAssignment,
  } = useFieldArray({
    control: form.control,
    name: "assignments",
  });

  // Hydrate from existing plan once loaded.
  useEffect(() => {
    if (!planQuery.data) return;
    const p = planQuery.data;
    form.reset({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      startDate: p.startDate.slice(0, 10),
      endDate: p.endDate.slice(0, 10),
      householdIds:
        p.householdIds.length > 0
          ? p.householdIds
          : [p.createdByHouseholdId],
      portionRequirements: p.portionRequirements.map((r) => ({
        portionCategoryId: r.portionCategoryId,
        count: r.count,
        athleteCount: r.athleteCount,
      })),
      assignments: p.assignments.map((a) => ({
        id: a.id,
        recipeId: a.recipeId,
        assignmentDate: a.assignmentDate.slice(0, 10),
        mealSlot: a.mealSlot,
        servings: a.servings,
        notes: a.notes ?? undefined,
      })),
    });
  }, [planQuery.data, form]);

  // Ensure creator household is always in householdIds once known.
  useEffect(() => {
    if (!creatorHouseholdId) return;
    const current = form.getValues("householdIds") ?? [];
    if (!current.includes(creatorHouseholdId)) {
      form.setValue("householdIds", [creatorHouseholdId, ...current], {
        shouldDirty: false,
      });
    }
  }, [creatorHouseholdId, form]);

  const recipeSearch = form.watch("assignments");
  // Simple recipe list for pickers (first page).
  const recipesQuery = useQuery(
    trpc.recipe.list.queryOptions({ limit: 50 }),
  );

  const upsert = useMutation(
    trpc.mealPlan.upsert.mutationOptions({
      onSuccess: async (data) => {
        setFormError(null);
        await queryClient.invalidateQueries({
          predicate: (q) =>
            JSON.stringify(q.queryKey).includes("mealPlan"),
        });
        router.push(`/plans/${data.id}/edit`);
        router.refresh();
      },
      onError: (err) => {
        const code = err.data?.code;
        const msg = err.message ?? "Save failed";
        if (code === "FORBIDDEN") {
          setFormError("You don’t have permission to save this plan.");
        } else if (code === "BAD_REQUEST") {
          // Stranded-assignments / range trigger messages.
          setFormError(msg);
          form.setError("assignments", { message: msg });
          if (/range|assignment/i.test(msg)) {
            form.setError("endDate", { message: msg });
          }
        } else {
          setFormError(msg);
        }
      },
    }),
  );

  const portionValue = form.watch("portionRequirements") as
    | PortionRequirementValue[]
    | undefined;
  const householdIds = form.watch("householdIds") ?? [];

  const categories = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        baseProteinOz: c.baseProteinOz,
        isActive: c.isActive,
      })),
    [categoriesQuery.data],
  );

  const households = householdsQuery.data ?? [];
  const athleteMultiplier = settingsQuery.data?.athleteMultiplier ?? 1.5;

  if (meQuery.isLoading || (planId && planQuery.isLoading)) {
    return <p className="p-4 text-sm text-zinc-500">Loading plan editor…</p>;
  }

  if (meQuery.data === null) {
    return (
      <p className="p-4 text-sm text-amber-700">
        Waiting for family invite — plan editing is unavailable.
      </p>
    );
  }

  return (
    <form
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6"
      onSubmit={form.handleSubmit((values) => {
        setFormError(null);
        const payload: MealPlanUpsertInput = {
          ...values,
          id: planId ?? values.id,
          householdIds: Array.from(
            new Set([creatorHouseholdId, ...(values.householdIds ?? [])]),
          ).filter(Boolean),
          description: values.description || undefined,
        };
        upsert.mutate(payload);
      })}
      noValidate
    >
      <Card>
        <CardHeader>
          <CardTitle>{planId ? "Edit meal plan" : "New meal plan"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...form.register("title")} />
            {form.formState.errors.title && (
              <p className="text-xs text-red-600">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...form.register("description")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                {...form.register("startDate")}
              />
              {form.formState.errors.startDate && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.startDate.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" {...form.register("endDate")} />
              {form.formState.errors.endDate && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.endDate.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sharing</CardTitle>
        </CardHeader>
        <CardContent>
          {creatorHouseholdId ? (
            <Controller
              control={form.control}
              name="householdIds"
              render={({ field }) => (
                <ShareChecklist
                  households={households}
                  creatorHouseholdId={creatorHouseholdId}
                  value={field.value ?? [creatorHouseholdId]}
                  onChange={field.onChange}
                />
              )}
            />
          ) : (
            <p className="text-sm text-zinc-500">Loading households…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portion calculator</CardTitle>
        </CardHeader>
        <CardContent>
          <PortionGrid
            categories={categories}
            value={portionValue ?? []}
            athleteMultiplier={athleteMultiplier}
            onChange={(next) =>
              form.setValue("portionRequirements", next, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Assignments</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              appendAssignment({
                recipeId: recipesQuery.data?.items?.[0]?.id ?? "",
                assignmentDate: form.getValues("startDate") || today,
                mealSlot: "dinner",
                servings: 1,
              })
            }
          >
            Add assignment
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {assignmentFields.length === 0 && (
            <p className="text-sm text-zinc-500">
              No assignments yet. Add recipes to meal slots within the plan
              range.
            </p>
          )}
          {assignmentFields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2"
            >
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor={`assignments.${index}.recipeId`}>Recipe</Label>
                <select
                  id={`assignments.${index}.recipeId`}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  {...form.register(`assignments.${index}.recipeId`)}
                >
                  <option value="">Select a recipe…</option>
                  {(recipesQuery.data?.items ?? []).map(
                    (r: { id: string; title: string }) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`assignments.${index}.assignmentDate`}>
                  Date
                </Label>
                <Input
                  id={`assignments.${index}.assignmentDate`}
                  type="date"
                  {...form.register(`assignments.${index}.assignmentDate`)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`assignments.${index}.mealSlot`}>
                  Meal slot
                </Label>
                <select
                  id={`assignments.${index}.mealSlot`}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  {...form.register(`assignments.${index}.mealSlot`)}
                >
                  {MEAL_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`assignments.${index}.servings`}>
                  Servings
                </Label>
                <Input
                  id={`assignments.${index}.servings`}
                  type="number"
                  min={0.1}
                  step="any"
                  {...form.register(`assignments.${index}.servings`, {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAssignment(index)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {form.formState.errors.assignments && (
            <p className="text-xs text-red-600" role="alert">
              {form.formState.errors.assignments.message as string}
            </p>
          )}
          {/* silence unused watch lint in strict setups */}
          <span className="sr-only">{recipeSearch?.length ?? 0} assignments</span>
        </CardContent>
      </Card>

      {formError && (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={upsert.isPending}>
          {upsert.isPending ? "Saving…" : "Save plan"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/calendar")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

### FILE: apps/web/src/components/calendar/CalendarDashboard.tsx
```tsx
"use client";

/**
 * Calendar / Meal Planning Dashboard (§9.2).
 * react-big-calendar week (default) + month; mobile day list under sm.
 * Shared vs private styling, protein rollup strip, quick actions.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  dateFnsLocalizer,
  type EventProps,
  type View,
} from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  addDays,
  isSameDay,
} from "date-fns";
import { enUS } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useRealtimePlanInvalidation } from "@/hooks/useRealtimePlanInvalidation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProteinRollupStrip } from "@/components/calendar/ProteinRollupStrip";
import { MobileDayList } from "@/components/calendar/MobileDayList";
import { DayDetailPanel } from "@/components/calendar/DayDetailPanel";
import { cn, toIsoDate } from "@/lib/utils";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 0 }),
  getDay,
  locales,
});

export type CalendarAssignmentEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: {
    planId: string;
    planTitle: string;
    isShared: boolean;
    mealSlot: string;
    recipeTitle: string;
    assignmentId: string;
  };
};

function rangeForView(date: Date, view: View): { start: string; end: string } {
  if (view === "month") {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    return {
      start: toIsoDate(startOfWeek(monthStart, { weekStartsOn: 0 })),
      end: toIsoDate(endOfWeek(monthEnd, { weekStartsOn: 0 })),
    };
  }
  // week (default) and day
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
  return { start: toIsoDate(weekStart), end: toIsoDate(weekEnd) };
}

export function CalendarDashboard() {
  const trpc = useTRPC();
  const router = useRouter();
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<View>("week");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const range = useMemo(() => rangeForView(date, view), [date, view]);

  useRealtimePlanInvalidation(range);

  const plansQuery = useQuery(
    trpc.mealPlan.listRange.queryOptions({
      start: range.start,
      end: range.end,
    }),
  );
  const rollupQuery = useQuery(
    trpc.mealPlan.proteinRollup.queryOptions({
      start: range.start,
      end: range.end,
    }),
  );

  const events: CalendarAssignmentEvent[] = useMemo(() => {
    const plans = plansQuery.data ?? [];
    const out: CalendarAssignmentEvent[] = [];
    for (const plan of plans) {
      const assignments = plan.assignments ?? [];
      for (const a of assignments) {
        const day = parse(a.assignmentDate.slice(0, 10), "yyyy-MM-dd", new Date());
        out.push({
          id: a.id,
          title: `${a.mealSlot}: ${a.recipeTitle ?? "Recipe"}`,
          start: day,
          end: day,
          allDay: true,
          resource: {
            planId: plan.id,
            planTitle: plan.title,
            isShared: plan.isShared,
            mealSlot: a.mealSlot,
            recipeTitle: a.recipeTitle ?? "Recipe",
            assignmentId: a.id,
          },
        });
      }
      // Plans with no assignments still appear as a span marker on start day.
      if (assignments.length === 0) {
        const day = parse(plan.startDate.slice(0, 10), "yyyy-MM-dd", new Date());
        out.push({
          id: `plan-${plan.id}`,
          title: plan.title,
          start: day,
          end: day,
          allDay: true,
          resource: {
            planId: plan.id,
            planTitle: plan.title,
            isShared: plan.isShared,
            mealSlot: "",
            recipeTitle: plan.title,
            assignmentId: "",
          },
        });
      }
    }
    return out;
  }, [plansQuery.data]);

  const EventComponent = useCallback(
    ({ event }: EventProps<CalendarAssignmentEvent>) => {
      const shared = event.resource.isShared;
      return (
        <span
          className={cn(
            "flex items-center gap-1 truncate text-[11px] leading-tight",
            shared ? "font-semibold" : "font-normal opacity-90",
          )}
          title={`${event.resource.planTitle} — ${event.title}`}
        >
          {shared && (
            <span aria-hidden className="inline-block" title="Shared plan">
              👪
            </span>
          )}
          <span className="truncate">{event.title}</span>
        </span>
      );
    },
    [],
  );

  const eventPropGetter = useCallback((event: CalendarAssignmentEvent) => {
    if (event.resource.isShared) {
      return {
        className: "mb-rbc-shared",
        style: {
          backgroundColor: "#047857",
          borderColor: "#065f46",
          color: "#fff",
        },
      };
    }
    return {
      className: "mb-rbc-private",
      style: {
        backgroundColor: "#a1a1aa",
        borderColor: "#71717a",
        color: "#fff",
      },
    };
  }, []);

  const selectedPlanIds = useMemo(
    () => (plansQuery.data ?? []).map((p) => p.id),
    [plansQuery.data],
  );

  const shoppingHref =
    selectedPlanIds.length > 0
      ? `/shopping?plans=${selectedPlanIds.join(",")}`
      : "/shopping";

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Meal calendar
          </h1>
          <SharedPrivateLegend />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push("/plans/new")}>New plan</Button>
          <Link
            href={shoppingHref}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Shopping list
          </Link>
        </div>
      </header>

      <ProteinRollupStrip
        rows={rollupQuery.data ?? []}
        loading={rollupQuery.isLoading}
      />

      {/* Desktop / tablet calendar */}
      <div className="hidden sm:block">
        <div className="mb-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={view === "week" ? "default" : "outline"}
            onClick={() => setView("week")}
          >
            Week
          </Button>
          <Button
            size="sm"
            variant={view === "month" ? "default" : "outline"}
            onClick={() => setView("month")}
          >
            Month
          </Button>
        </div>
        <div
          className="h-[min(70vh,40rem)] rounded-xl border border-zinc-200 bg-white p-2"
          data-testid="calendar-desktop"
        >
          <Calendar
            localizer={localizer}
            events={events}
            date={date}
            view={view}
            onNavigate={setDate}
            onView={setView}
            views={["week", "month"]}
            popup
            selectable
            onSelectSlot={(slot) => {
              setSelectedDay(slot.start);
            }}
            onSelectEvent={(ev) => {
              setSelectedDay(ev.start);
            }}
            onDrillDown={(d) => setSelectedDay(d)}
            components={{ event: EventComponent }}
            eventPropGetter={eventPropGetter}
            style={{ height: "100%" }}
            messages={{
              showMore: (n) => `+${n} more`,
            }}
          />
        </div>
      </div>

      {/* Mobile vertical day list */}
      <div className="sm:hidden" data-testid="calendar-mobile">
        <MobileDayList
          anchor={date}
          events={events}
          plans={plansQuery.data ?? []}
          onSelectDay={setSelectedDay}
          onShiftWeek={(delta) => setDate((d) => addDays(d, delta * 7))}
        />
      </div>

      {plansQuery.isLoading && (
        <p className="text-sm text-zinc-500">Loading plans…</p>
      )}
      {plansQuery.isError && (
        <p className="text-sm text-red-600" role="alert">
          Could not load plans for this range.
        </p>
      )}

      {selectedDay && (
        <DayDetailPanel
          day={selectedDay}
          plans={(plansQuery.data ?? []).filter((p) => {
            const start = p.startDate.slice(0, 10);
            const end = p.endDate.slice(0, 10);
            const iso = toIsoDate(selectedDay);
            return iso >= start && iso <= end;
          })}
          events={events.filter((e) => isSameDay(e.start, selectedDay))}
          onClose={() => setSelectedDay(null)}
          onAddToPlan={() => {
            const iso = toIsoDate(selectedDay);
            router.push(`/plans/new?start=${iso}&end=${iso}`);
          }}
        />
      )}
    </div>
  );
}

function SharedPrivateLegend() {
  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-600"
      aria-label="Plan visibility legend"
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-700"
          aria-hidden
        />
        <span>👪 Shared family plan</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm bg-zinc-400"
          aria-hidden
        />
        <span>Private household plan</span>
      </span>
      <Badge className="bg-transparent text-zinc-400">§9.5 visual language</Badge>
    </div>
  );
}
```

### FILE: apps/web/src/components/calendar/ProteinRollupStrip.tsx
```tsx
"use client";

import { roundOz } from "@menu-boss/portion-calc";
import { cn } from "@/lib/utils";

export type ProteinRollupRow = {
  mealPlanId: string;
  title: string;
  startDate: string;
  endDate: string;
  effectiveProteinOz: number;
};

export function ProteinRollupStrip({
  rows,
  loading,
  className,
}: {
  rows: ProteinRollupRow[];
  loading?: boolean;
  className?: string;
}) {
  const total = rows.reduce((s, r) => s + r.effectiveProteinOz, 0);

  return (
    <div
      className={cn(
        "rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 sm:px-4",
        className,
      )}
      data-testid="protein-rollup-strip"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/80">
            Weekly protein total
          </p>
          <p
            className="text-xl font-semibold tabular-nums text-emerald-900"
            data-testid="protein-rollup-total"
          >
            {loading ? "…" : `${roundOz(total)} oz`}
          </p>
        </div>
        {rows.length > 0 && (
          <details className="text-sm text-emerald-900">
            <summary className="cursor-pointer select-none font-medium">
              Breakdown by plan
            </summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto pr-1">
              {rows.map((r) => (
                <li
                  key={r.mealPlanId}
                  className="flex justify-between gap-4 border-t border-emerald-100/80 py-1 text-xs"
                >
                  <span className="truncate">{r.title}</span>
                  <span className="tabular-nums">
                    {roundOz(r.effectiveProteinOz)} oz
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
```

### FILE: apps/web/src/components/calendar/MobileDayList.tsx
```tsx
"use client";

import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarAssignmentEvent } from "@/components/calendar/CalendarDashboard";

type PlanSummary = {
  id: string;
  title: string;
  isShared: boolean;
  startDate: string;
  endDate: string;
};

export function MobileDayList({
  anchor,
  events,
  plans,
  onSelectDay,
  onShiftWeek,
}: {
  anchor: Date;
  events: CalendarAssignmentEvent[];
  plans: PlanSummary[];
  onSelectDay: (d: Date) => void;
  onShiftWeek: (delta: number) => void;
}) {
  const weekStart = startOfWeek(anchor, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onShiftWeek(-1)}
          aria-label="Previous week"
        >
          ← Prev
        </Button>
        <p className="text-sm font-medium text-zinc-700">
          {format(weekStart, "MMM d")} –{" "}
          {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onShiftWeek(1)}
          aria-label="Next week"
        >
          Next →
        </Button>
      </div>

      <ul className="flex flex-col gap-2" role="list">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(e.start, day));
          const iso = format(day, "yyyy-MM-dd");
          const covering = plans.filter(
            (p) =>
              iso >= p.startDate.slice(0, 10) && iso <= p.endDate.slice(0, 10),
          );
          return (
            <li key={iso}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-xl border border-zinc-200 bg-white p-3 text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
                  "hover:border-emerald-300",
                )}
                onClick={() => onSelectDay(day)}
                aria-label={`${format(day, "EEEE, MMM d")}: ${dayEvents.length} items`}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-zinc-900">
                    {format(day, "EEE MMM d")}
                  </span>
                  {covering.some((p) => p.isShared) && (
                    <span className="text-xs text-emerald-700">👪 shared</span>
                  )}
                </div>
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-zinc-400">No meals planned</p>
                ) : (
                  <ul className="space-y-1">
                    {dayEvents.map((ev) => (
                      <li
                        key={ev.id}
                        className={cn(
                          "truncate rounded px-1.5 py-0.5 text-xs text-white",
                          ev.resource.isShared
                            ? "bg-emerald-700"
                            : "bg-zinc-400",
                        )}
                      >
                        {ev.title}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

### FILE: apps/web/src/components/calendar/DayDetailPanel.tsx
```tsx
"use client";

import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarAssignmentEvent } from "@/components/calendar/CalendarDashboard";
import { cn } from "@/lib/utils";

type PlanLite = {
  id: string;
  title: string;
  isShared: boolean;
  startDate: string;
  endDate: string;
};

export function DayDetailPanel({
  day,
  plans,
  events,
  onClose,
  onAddToPlan,
}: {
  day: Date;
  plans: PlanLite[];
  events: CalendarAssignmentEvent[];
  onClose: () => void;
  onAddToPlan: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-detail-title"
    >
      <Card className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-b-none sm:rounded-xl">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle id="day-detail-title">
              {format(day, "EEEE, MMM d")}
            </CardTitle>
            <p className="text-xs text-zinc-500">Meal slots & plans</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onAddToPlan}>
              Add to plan
            </Button>
          </div>

          {events.length === 0 && plans.length === 0 && (
            <p className="text-sm text-zinc-500">
              Nothing scheduled. Create a plan to get started.
            </p>
          )}

          {events.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-800">
                Assignments
              </h3>
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      ev.resource.isShared
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-zinc-200 bg-zinc-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {ev.resource.mealSlot
                          ? `${ev.resource.mealSlot}: `
                          : ""}
                        {ev.resource.recipeTitle}
                      </span>
                      {ev.resource.isShared && (
                        <span className="text-xs" title="Shared">
                          👪
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/plans/${ev.resource.planId}/edit`}
                      className="text-xs text-emerald-800 underline"
                    >
                      {ev.resource.planTitle}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plans.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-800">
                Covering plans
              </h3>
              <ul className="space-y-1">
                {plans.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/plans/${p.id}/edit`}
                      className="text-sm text-emerald-800 underline"
                    >
                      {p.isShared ? "👪 " : ""}
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### FILE: apps/web/src/app/layout.tsx
```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/providers/AppProviders";
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
  description: "Shared family meal planning",
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
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
```

### FILE: apps/web/src/app/page.tsx
```tsx
import { redirect } from "next/navigation";

/** Root → calendar (middleware sends unauthenticated users to /login). */
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
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}

/* react-big-calendar tweaks for MenuBoss shared/private language */
.rbc-calendar {
  font-family: inherit;
}
.rbc-event {
  border-radius: 4px;
  padding: 1px 4px;
}
.rbc-today {
  background-color: rgb(236 253 245 / 0.55);
}
.rbc-off-range-bg {
  background: #fafafa;
}
.mb-rbc-shared {
  box-shadow: inset 0 0 0 1px rgb(6 95 70 / 0.3);
}
.mb-rbc-private {
  opacity: 0.92;
}
```

### FILE: apps/web/src/app/login/page.tsx
```tsx
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
```

### FILE: apps/web/src/app/(app)/layout.tsx
```tsx
"use client";

/**
 * Authenticated app shell. Gates on profile row (waiting-for-invite).
 * <!-- COORDINATOR: 0005 auth provisioning -->
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { useSession } from "@/providers/SessionProvider";
import { WaitingForInvite } from "@/components/auth/WaitingForInvite";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
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
            className="text-sm font-semibold tracking-tight text-emerald-800"
          >
            MenuBoss
          </Link>
          <nav
            className="hidden items-center gap-1 sm:flex"
            aria-label="Primary"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
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
          <div className="flex items-center gap-2">
            {meQuery.data?.profile.displayName && (
              <span className="hidden text-xs text-zinc-500 sm:inline">
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
        <ul className="grid grid-cols-4">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
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
```

### FILE: apps/web/src/app/(app)/calendar/page.tsx
```tsx
import { CalendarDashboard } from "@/components/calendar/CalendarDashboard";

export default function CalendarPage() {
  return <CalendarDashboard />;
}
```

### FILE: apps/web/src/app/(app)/plans/new/page.tsx
```tsx
import { MealPlanEditor } from "@/components/meal-plan/MealPlanEditor";

type SearchParams = Promise<{ start?: string; end?: string }>;

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  return (
    <MealPlanEditor
      defaultStartDate={sp.start}
      defaultEndDate={sp.end}
    />
  );
}
```

### FILE: apps/web/src/app/(app)/plans/[id]/edit/page.tsx
```tsx
import { MealPlanEditor } from "@/components/meal-plan/MealPlanEditor";

type Params = Promise<{ id: string }>;

export default async function EditPlanPage({ params }: { params: Params }) {
  const { id } = await params;
  return <MealPlanEditor planId={id} />;
}
```

### FILE: apps/web/src/app/(app)/waiting/page.tsx
```tsx
import { WaitingForInvite } from "@/components/auth/WaitingForInvite";

/** Explicit route for invite-pending state (also rendered by app layout). */
export default function WaitingPage() {
  return <WaitingForInvite />;
}
```

### FILE: apps/web/src/app/(app)/recipes/page.tsx
```tsx
/** Placeholder — full UI in Task 12. */
export default function RecipesPlaceholderPage() {
  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Recipes</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Recipe browser arrives in Task 12.
      </p>
    </div>
  );
}
```

### FILE: apps/web/src/app/(app)/ideas/page.tsx
```tsx
/** Placeholder — full UI in Task 12. */
export default function IdeasPlaceholderPage() {
  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Ideas</h1>
      <p className="mt-2 text-sm text-zinc-500">
        ChefIdea browser arrives in Task 12.
      </p>
    </div>
  );
}
```

### FILE: apps/web/src/app/(app)/shopping/page.tsx
```tsx
/** Placeholder — full shopping list UI in Task 12. */
export default async function ShoppingPlaceholderPage({
  searchParams,
}: {
  searchParams: Promise<{ plans?: string }>;
}) {
  const sp = await searchParams;
  const planIds = sp.plans?.split(",").filter(Boolean) ?? [];
  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Shopping list</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Full shopping list screen arrives in Task 12.
      </p>
      {planIds.length > 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          Selected plan ids: {planIds.join(", ")}
        </p>
      )}
    </div>
  );
}
```

