/**
 * Playwright global setup — TEST ONLY against throwaway local Supabase.
 *
 * THE ONLY sanctioned service-role usage in the app tree:
 * creates auth.users for seed personas with ids = profile UUIDs, then
 * signs in via anon key to write storageState files and seed content fixtures
 * under member_a JWT (no service role for data).
 *
 * Skips entirely when E2E_SUPABASE_URL is unset (local machines without Docker).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { FullConfig } from "@playwright/test";
import { PERSONAS, type PersonaKey } from "./personas";
import { isE2EEnabled, requireE2EEnv } from "./helpers/env";
import { cleanupE2EPlans } from "./helpers/cleanup";
import { ensureContentFixtures } from "./helpers/fixtures";
import { signInAs } from "./helpers/supabase";

/** Local Supabase storage key prefix for 127.0.0.1:54321 → sb-127-auth-token */
function projectRefFromUrl(supabaseUrl: string): string {
  try {
    const host = new URL(supabaseUrl).hostname;
    // *.supabase.co → subdomain; local 127.0.0.1 → "127"
    if (host.endsWith("supabase.co")) {
      return host.split(".")[0] ?? "local";
    }
    return host.split(".")[0] ?? "127";
  } catch {
    return "127";
  }
}

async function ensureAuthUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: import("@supabase/supabase-js").SupabaseClient<any, any, any, any, any>,
  persona: PersonaKey,
): Promise<void> {
  const p = PERSONAS[persona];
  // createUser with fixed id; if exists, update password so re-runs are idempotent
  const { data: created, error: createErr } =
    await serviceClient.auth.admin.createUser({
      id: p.id,
      email: p.email,
      password: p.password,
      email_confirm: true,
      user_metadata: { display_name: p.displayName },
    });

  if (!createErr && created.user) {
    return;
  }

  const msg = createErr?.message?.toLowerCase() ?? "";
  const already =
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists") ||
    createErr?.status === 422;

  if (!already) {
    throw new Error(
      `admin.createUser(${persona}) failed: ${createErr?.message ?? "unknown"}`,
    );
  }

  // Look up by email and reset password + confirm
  const { data: list, error: listErr } =
    await serviceClient.auth.admin.listUsers({ perPage: 200 });
  if (listErr) {
    throw new Error(`admin.listUsers failed: ${listErr.message}`);
  }
  const existing = list.users.find(
    (u) => u.email?.toLowerCase() === p.email.toLowerCase() || u.id === p.id,
  );
  if (!existing) {
    throw new Error(
      `createUser said exists for ${persona} but listUsers found no match`,
    );
  }
  if (existing.id !== p.id) {
    throw new Error(
      `Auth user for ${p.email} has id ${existing.id}, expected seed profile id ${p.id}`,
    );
  }

  const { error: updateErr } = await serviceClient.auth.admin.updateUserById(
    existing.id,
    {
      password: p.password,
      email_confirm: true,
    },
  );
  if (updateErr) {
    throw new Error(
      `admin.updateUserById(${persona}) failed: ${updateErr.message}`,
    );
  }
}

/**
 * Build a Playwright storageState that works with @supabase/ssr cookie sessions
 * and the default localStorage key used by supabase-js browser clients.
 */
function buildStorageState(
  supabaseUrl: string,
  baseURL: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  userJson: Record<string, unknown>,
): {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "None" | "Strict";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
} {
  const ref = projectRefFromUrl(supabaseUrl);
  const sessionPayload = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    token_type: "bearer",
    user: userJson,
  };
  const sessionStr = JSON.stringify(sessionPayload);

  // Cookie chunking mirrors @supabase/ssr defaults (sb-<ref>-auth-token)
  const cookieName = `sb-${ref}-auth-token`;
  const origin = new URL(baseURL);
  const cookieDomain = origin.hostname;
  const maxChunk = 3180;
  const cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "None" | "Strict";
  }> = [];

  if (sessionStr.length <= maxChunk) {
    cookies.push({
      name: cookieName,
      value: encodeURIComponent(sessionStr),
      domain: cookieDomain,
      path: "/",
      expires: expiresAt,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    });
  } else {
    const encoded = encodeURIComponent(sessionStr);
    let i = 0;
    for (let offset = 0; offset < encoded.length; offset += maxChunk) {
      cookies.push({
        name: `${cookieName}.${i}`,
        value: encoded.slice(offset, offset + maxChunk),
        domain: cookieDomain,
        path: "/",
        expires: expiresAt,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      });
      i += 1;
    }
  }

  return {
    cookies,
    origins: [
      {
        origin: origin.origin,
        localStorage: [
          {
            name: `sb-${ref}-auth-token`,
            value: sessionStr,
          },
        ],
      },
    ],
  };
}

async function writePersonaStorageState(
  persona: PersonaKey,
  supabaseUrl: string,
  anonKey: string,
  baseURL: string,
  webRoot: string,
): Promise<void> {
  const p = PERSONAS[persona];
  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: p.email,
    password: p.password,
  });
  if (error || !data.session) {
    throw new Error(
      `signInWithPassword(${persona}) failed: ${error?.message ?? "no session"}`,
    );
  }

  const { access_token, refresh_token, expires_at, user } = data.session;
  const state = buildStorageState(
    supabaseUrl,
    baseURL,
    access_token,
    refresh_token,
    expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    user as unknown as Record<string, unknown>,
  );

  const outPath = path.join(webRoot, p.storageState);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(state, null, 2), "utf8");
  console.log(`[e2e global-setup] wrote storageState → ${p.storageState}`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (!isE2EEnabled()) {
    console.log(
      "[e2e global-setup] E2E_SUPABASE_URL not set — skipping auth provisioning (suites will skip).",
    );
    return;
  }

  const { supabaseUrl, anonKey, serviceRoleKey, baseURL } = requireE2EEnv();
  const webRoot = path.resolve(__dirname, "..");

  console.log(
    `[e2e global-setup] provisioning auth users against ${supabaseUrl}`,
  );

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Brief: member_a / admin_a / member_b. Also member_c for Scenario 11 control.
  const keys: PersonaKey[] = ["member_a", "admin_a", "member_b", "member_c"];
  for (const key of keys) {
    await ensureAuthUser(serviceClient, key);
    console.log(`[e2e global-setup] auth user ready: ${key} (${PERSONAS[key].id})`);
  }

  for (const key of keys) {
    await writePersonaStorageState(key, supabaseUrl, anonKey, baseURL, webRoot);
  }

  // Content fixtures under member_a JWT only (no service role).
  const memberA = await signInAs("member_a");
  await ensureContentFixtures(memberA);
  console.log("[e2e global-setup] content fixtures ready (member_a JWT)");

  // Pre-clean plans left by prior crashed runs (teardown handles normal runs).
  await cleanupE2EPlans(memberA, "global-setup");
}
