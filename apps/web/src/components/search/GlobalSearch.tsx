/**
 * Global search (§8.8): recipes + chefIdeas + combinations + ingredients in parallel.
 * Desktop: header combobox. Mobile: sheet triggered from header control.
 * Recent searches in localStorage. Results respect D7 (family-global list procs).
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const RECENT_KEY = "menuboss-recent-searches-v1";
const RECENT_MAX = 8;
const DEBOUNCE_MS = 200;
const RESULT_LIMIT = 6;

type ResultKind = "recipe" | "idea" | "combination" | "ingredient";

type SearchHit = {
  kind: ResultKind;
  id: string;
  title: string;
  href: string;
  subtitle?: string | null;
};

const KIND_LABEL: Record<ResultKind, string> = {
  recipe: "Recipe",
  idea: "Idea",
  combination: "Meal",
  ingredient: "Ingredient",
};

const KIND_BADGE: Record<ResultKind, string> = {
  recipe: "bg-emerald-100 text-emerald-900",
  idea: "bg-sky-100 text-sky-900",
  combination: "bg-violet-100 text-violet-900",
  ingredient: "bg-amber-100 text-amber-900",
};

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function saveRecent(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return loadRecent();
  const next = [
    trimmed,
    ...loadRecent().filter((r) => r.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // quota / private mode — ignore
  }
  return next;
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function GlobalSearch({ className }: { className?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const listboxId = useId();
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  const debouncedQ = useDebounced(q.trim(), DEBOUNCE_MS);
  const enabled = debouncedQ.length > 0 && (open || mobileSheet);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    if (mobileSheet) {
      window.setTimeout(() => mobileInputRef.current?.focus(), 50);
    }
  }, [mobileSheet]);

  const recipesQuery = useQuery({
    ...trpc.recipe.list.queryOptions({ q: debouncedQ, limit: RESULT_LIMIT }),
    enabled,
  });
  const ideasQuery = useQuery({
    ...trpc.chefIdea.list.queryOptions({ q: debouncedQ, limit: RESULT_LIMIT }),
    enabled,
  });
  const combosQuery = useQuery({
    ...trpc.recipeCombination.list.queryOptions({
      q: debouncedQ,
      limit: RESULT_LIMIT,
    }),
    enabled,
  });
  const ingredientsQuery = useQuery({
    ...trpc.ingredient.list.queryOptions({
      q: debouncedQ,
      limit: RESULT_LIMIT,
    }),
    enabled,
  });

  const hits: SearchHit[] = useMemo(() => {
    if (!debouncedQ) return [];
    const out: SearchHit[] = [];

    for (const r of recipesQuery.data?.items ?? []) {
      out.push({
        kind: "recipe",
        id: r.id as string,
        title: r.title as string,
        href: `/recipes/${r.id}`,
        subtitle: (r.description as string | null) ?? null,
      });
    }
    for (const idea of ideasQuery.data?.items ?? []) {
      out.push({
        kind: "idea",
        id: idea.id,
        title: idea.title,
        href: `/ideas/${idea.id}`,
        subtitle: idea.status,
      });
    }
    for (const c of combosQuery.data?.items ?? []) {
      out.push({
        kind: "combination",
        id: c.id,
        title: c.name,
        href: `/recipes/combinations/${c.id}`,
        subtitle: c.notes,
      });
    }
    for (const ing of ingredientsQuery.data?.items ?? []) {
      out.push({
        kind: "ingredient",
        id: ing.id,
        title: ing.name,
        href: `/recipes?q=${encodeURIComponent(ing.name)}`,
        subtitle: ing.isDeleted ? "deleted" : null,
      });
    }
    return out;
  }, [
    debouncedQ,
    recipesQuery.data,
    ideasQuery.data,
    combosQuery.data,
    ingredientsQuery.data,
  ]);

  const loading =
    enabled &&
    (recipesQuery.isFetching ||
      ideasQuery.isFetching ||
      combosQuery.isFetching ||
      ingredientsQuery.isFetching);

  const flatOptions: Array<
    { type: "hit"; hit: SearchHit } | { type: "recent"; term: string }
  > = useMemo(() => {
    if (debouncedQ) {
      return hits.map((hit) => ({ type: "hit" as const, hit }));
    }
    return recent.map((term) => ({ type: "recent" as const, term }));
  }, [debouncedQ, hits, recent]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQ, open, mobileSheet]);

  const closeAll = useCallback(() => {
    setOpen(false);
    setMobileSheet(false);
  }, []);

  const selectHit = useCallback(
    (hit: SearchHit) => {
      setRecent(saveRecent(debouncedQ || hit.title));
      closeAll();
      setQ("");
      router.push(hit.href);
    },
    [closeAll, debouncedQ, router],
  );

  const selectRecent = useCallback((term: string) => {
    setQ(term);
    setOpen(true);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAll();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) =>
        flatOptions.length === 0 ? 0 : Math.min(i + 1, flatOptions.length - 1),
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && flatOptions[activeIndex]) {
      e.preventDefault();
      const opt = flatOptions[activeIndex]!;
      if (opt.type === "hit") selectHit(opt.hit);
      else selectRecent(opt.term);
    }
  };

  const panel = (
    <div
      id={listboxId}
      role="listbox"
      data-testid="global-search-results"
      className="max-h-[min(70vh,24rem)] overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
    >
      {!debouncedQ && recent.length > 0 ? (
        <div className="border-b border-zinc-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Recent
        </div>
      ) : null}

      {!debouncedQ && recent.length === 0 ? (
        <p className="px-3 py-4 text-sm text-zinc-500">
          Search recipes, ideas, meals, and ingredients
        </p>
      ) : null}

      {debouncedQ && loading && hits.length === 0 ? (
        <p
          className="px-3 py-4 text-sm text-zinc-500"
          data-testid="global-search-loading"
        >
          Searching…
        </p>
      ) : null}

      {debouncedQ && !loading && hits.length === 0 ? (
        <p
          className="px-3 py-4 text-sm text-zinc-500"
          data-testid="global-search-empty"
        >
          No matches for &ldquo;{debouncedQ}&rdquo;
        </p>
      ) : null}

      <ul className="py-1">
        {flatOptions.map((opt, index) => {
          if (opt.type === "recent") {
            return (
              <li
                key={`recent-${opt.term}`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                    index === activeIndex ? "bg-emerald-50" : "hover:bg-zinc-50",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectRecent(opt.term)}
                >
                  <span className="text-zinc-400" aria-hidden>
                    ⏱
                  </span>
                  <span className="truncate text-zinc-800">{opt.term}</span>
                </button>
              </li>
            );
          }
          const { hit } = opt;
          return (
            <li
              key={`${hit.kind}-${hit.id}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                data-testid="global-search-hit"
                data-kind={hit.kind}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm",
                  index === activeIndex ? "bg-emerald-50" : "hover:bg-zinc-50",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectHit(hit)}
              >
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    KIND_BADGE[hit.kind],
                  )}
                >
                  {KIND_LABEL[hit.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-zinc-900">
                    {hit.title}
                  </span>
                  {hit.subtitle ? (
                    <span className="block truncate text-xs text-zinc-500">
                      {hit.subtitle}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {debouncedQ && hits.length > 0 ? (
        <div className="border-t border-zinc-100 px-3 py-2 text-xs text-zinc-500">
          <Link
            href={`/recipes?q=${encodeURIComponent(debouncedQ)}`}
            className="text-emerald-800 underline"
            onClick={() => {
              setRecent(saveRecent(debouncedQ));
              closeAll();
            }}
          >
            Browse all recipes for &ldquo;{debouncedQ}&rdquo;
          </Link>
        </div>
      ) : null}
    </div>
  );

  const inputClassName = cn(
    "h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm",
    "placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-emerald-600",
  );

  return (
    <div className={cn("relative", className)} data-testid="global-search">
      {/* Desktop inline search */}
      <div className="relative hidden min-w-[14rem] max-w-sm flex-1 sm:block md:min-w-[18rem]">
        <input
          ref={desktopInputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          data-testid="global-search-input"
          placeholder="Search recipes, ideas, meals…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={inputClassName}
        />
        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 cursor-default bg-transparent"
              aria-label="Close search"
              onClick={closeAll}
              tabIndex={-1}
            />
            <div className="absolute left-0 right-0 top-full z-40 mt-1">
              {panel}
            </div>
          </>
        ) : null}
      </div>

      {/* Mobile trigger */}
      <button
        type="button"
        data-testid="global-search-mobile-open"
        className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 sm:hidden"
        onClick={() => setMobileSheet(true)}
        aria-label="Open search"
      >
        Search
      </button>

      {/* Mobile sheet */}
      {mobileSheet ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/40 sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          data-testid="global-search-sheet"
        >
          <div className="mt-auto flex max-h-[90vh] flex-col rounded-t-2xl bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">Search</h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
                onClick={closeAll}
              >
                Close
              </button>
            </div>
            <input
              ref={mobileInputRef}
              type="search"
              role="combobox"
              aria-expanded={mobileSheet}
              aria-controls={listboxId}
              aria-autocomplete="list"
              data-testid="global-search-input"
              placeholder="Search recipes, ideas, meals…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              className={inputClassName}
            />
            <div className="mt-2 min-h-0 flex-1 overflow-auto">{panel}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
