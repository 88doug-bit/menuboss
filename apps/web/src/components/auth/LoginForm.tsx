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
