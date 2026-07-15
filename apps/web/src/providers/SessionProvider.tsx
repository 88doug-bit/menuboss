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
import { clearClientState } from "@/lib/offline/persistQuery";
import { createClient } from "@/lib/supabase/client";

type SessionContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Prerender-safe: the browser client needs NEXT_PUBLIC_* env and a window;
  // during build-time prerender (e.g. /_not-found) neither exists. Client
  // creation is deferred to the browser; SSR renders the loading state.
  const supabase = useMemo(
    () => (typeof window === "undefined" ? null : createClient()),
    [],
  );
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      // Shared-device hygiene: wipe ALL persisted client state whenever the
      // session ends or changes identity — not only on the explicit sign-out
      // button (token expiry / other-tab sign-out land here too).
      setSession((prev) => {
        const prevId = prev?.user?.id ?? null;
        const nextId = next?.user?.id ?? null;
        if (event === "SIGNED_OUT" || (prevId !== null && nextId !== prevId)) {
          clearClientState();
        }
        return next;
      });
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // The next user of this browser must not inherit cached family data.
    clearClientState();
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
