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
