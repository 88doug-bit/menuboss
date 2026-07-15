/**
 * "Invite someone" dialog — email trim/lowercase, household, role.
 * Copy reflects 0005: access on signup or immediately if account exists.
 */
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  isValidInviteEmail,
  normalizeInviteEmail,
} from "./adminValidation";

export type InviteHouseholdOption = {
  id: string;
  name: string;
};

export type InviteDialogSubmit = {
  email: string;
  householdId: string;
  role: "admin" | "member";
};

export function InviteDialog({
  open,
  households,
  onClose,
  onSubmit,
  isSubmitting = false,
  errorMessage,
}: {
  open: boolean;
  households: InviteHouseholdOption[];
  onClose: () => void;
  onSubmit: (payload: InviteDialogSubmit) => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [householdId, setHouseholdId] = useState(households[0]?.id ?? "");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!isValidInviteEmail(email)) {
      setLocalError("Enter a valid email address");
      return;
    }
    const hh = householdId || households[0]?.id;
    if (!hh) {
      setLocalError("Select a household");
      return;
    }
    onSubmit({
      email: normalizeInviteEmail(email),
      householdId: hh,
      role,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-dialog-title"
      data-testid="invite-dialog"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg">
        <h2
          id="invite-dialog-title"
          className="text-lg font-semibold text-zinc-900"
        >
          Invite someone
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          They&apos;ll get access when they sign up — or immediately if they
          already have an account.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={handleSubmit}
          noValidate
        >
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              data-testid="invite-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmail((v) => normalizeInviteEmail(v))}
              placeholder="person@example.com"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="invite-household">Household</Label>
            <select
              id="invite-household"
              data-testid="invite-household"
              className="mt-1 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
              value={householdId || households[0]?.id || ""}
              onChange={(e) => setHouseholdId(e.target.value)}
            >
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              data-testid="invite-role"
              className="mt-1 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "admin" | "member")
              }
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {(localError || errorMessage) && (
            <p
              className="text-sm text-red-600"
              role="alert"
              data-testid="invite-error"
            >
              {localError || errorMessage}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-testid="invite-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="invite-submit"
            >
              {isSubmitting ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
