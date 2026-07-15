/**
 * tRPC fetch adapter route handler.
 *
 * Builds a per-request Supabase client from the caller's cookies via
 * `@supabase/ssr` (anon key + JWT — never the service-role key). RLS owns
 * authorization; this handler only threads the caller's identity through.
 */
import { createServerClient } from "@supabase/ssr";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { cookies } from "next/headers";

import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";

async function handler(req: Request): Promise<Response> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
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
            // `setAll` is called from a context where cookie mutation is not
            // allowed (e.g. a Server Component). Session refresh via middleware
            // covers this; safe to ignore here.
          }
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ supabase, session }),
  });
}

export { handler as GET, handler as POST };
