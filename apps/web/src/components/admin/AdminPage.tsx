/**
 * Family admin hub — invites/members, portion categories, units,
 * categories/tags, family settings, audit log.
 * Non-admins see a friendly "admins only" state (RLS still enforces).
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/lib/trpc/client";

import { FamilySettingsPanel } from "./FamilySettingsPanel";
import { InviteDialog } from "./InviteDialog";
import { PortionCategoriesPanel } from "./PortionCategoriesPanel";
import { slugifyName } from "./adminValidation";

const TABS = [
  { id: "invites", label: "Invites & members" },
  { id: "portions", label: "Portion categories" },
  { id: "units", label: "Units" },
  { id: "taxonomy", label: "Categories & tags" },
  { id: "settings", label: "Family settings" },
  { id: "audit", label: "Audit log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("invites");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);

  const meQuery = useQuery(trpc.family.me.queryOptions());
  const isAdmin = meQuery.data?.profile.role === "admin";

  const invitesQuery = useQuery({
    ...trpc.admin.invites.list.queryOptions({ status: "all" }),
    enabled: isAdmin && tab === "invites",
  });
  const householdsQuery = useQuery({
    ...trpc.admin.households.list.queryOptions({ activeOnly: false }),
    enabled: isAdmin && (tab === "invites" || inviteOpen),
  });
  const membersQuery = useQuery({
    ...trpc.admin.members.list.queryOptions({}),
    enabled: isAdmin && tab === "invites",
  });
  const portionsQuery = useQuery({
    ...trpc.admin.portionCategories.list.queryOptions(),
    enabled: isAdmin && tab === "portions",
  });
  const unitsQuery = useQuery({
    ...trpc.admin.units.list.queryOptions({ activeOnly: false }),
    enabled: isAdmin && tab === "units",
  });
  const settingsQuery = useQuery({
    ...trpc.admin.familySettings.get.queryOptions(),
    enabled: isAdmin && tab === "settings",
  });
  const auditQuery = useQuery({
    ...trpc.admin.audit.list.queryOptions({ limit: 50 }),
    enabled: isAdmin && tab === "audit",
  });
  const categoriesQuery = useQuery({
    ...trpc.category.list.queryOptions({ activeOnly: false }),
    enabled: isAdmin && tab === "taxonomy",
  });
  const tagsQuery = useQuery({
    ...trpc.tag.list.queryOptions({ activeOnly: false }),
    enabled: isAdmin && tab === "taxonomy",
  });

  const invalidateAdmin = () => {
    void qc.invalidateQueries();
  };

  const createInvite = useMutation(
    trpc.admin.invites.create.mutationOptions({
      onSuccess: () => {
        setInviteOpen(false);
        invalidateAdmin();
      },
    }),
  );
  const revokeInvite = useMutation(
    trpc.admin.invites.revoke.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const updatePortion = useMutation(
    trpc.admin.portionCategories.update.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const createPortion = useMutation(
    trpc.admin.portionCategories.create.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const setPortionActive = useMutation(
    trpc.admin.portionCategories.setActive.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const createUnit = useMutation(
    trpc.admin.units.create.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const updateUnit = useMutation(
    trpc.admin.units.update.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const setUnitActive = useMutation(
    trpc.admin.units.setActive.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const updateSettings = useMutation(
    trpc.admin.familySettings.update.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const createCategory = useMutation(
    trpc.category.create.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const updateCategory = useMutation(
    trpc.category.update.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const deactivateCategory = useMutation(
    trpc.category.deactivate.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const createTag = useMutation(
    trpc.tag.create.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const updateTag = useMutation(
    trpc.tag.update.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const deactivateTag = useMutation(
    trpc.tag.deactivate.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const createHousehold = useMutation(
    trpc.admin.households.create.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const renameHousehold = useMutation(
    trpc.admin.households.rename.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const setHouseholdActive = useMutation(
    trpc.admin.households.setActive.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );

  const pendingInvites = useMemo(
    () => (invitesQuery.data ?? []).filter((i) => i.acceptedAt == null),
    [invitesQuery.data],
  );
  const acceptedInvites = useMemo(
    () => (invitesQuery.data ?? []).filter((i) => i.acceptedAt != null),
    [invitesQuery.data],
  );

  const householdNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of householdsQuery.data ?? []) m.set(h.id, h.name);
    return m;
  }, [householdsQuery.data]);

  const unitsByDimension = useMemo(() => {
    const groups: Record<string, NonNullable<typeof unitsQuery.data>> = {
      mass: [],
      volume: [],
      count: [],
    };
    for (const u of unitsQuery.data ?? []) {
      (groups[u.dimension] ??= []).push(u);
    }
    return groups;
  }, [unitsQuery.data]);

  if (meQuery.isLoading) {
    return (
      <p className="p-6 text-sm text-zinc-500" data-testid="admin-loading">
        Loading…
      </p>
    );
  }

  if (!isAdmin) {
    return (
      <div
        className="mx-auto max-w-lg space-y-2 p-8 text-center"
        data-testid="admins-only"
      >
        <h1 className="text-xl font-semibold text-zinc-900">Admins only</h1>
        <p className="text-sm text-zinc-600">
          Family administration is limited to family admins. If you need access,
          ask an existing admin to invite you with the admin role.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6" data-testid="admin-page">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Family admin</h1>
        <p className="text-sm text-zinc-600">
          Invites, vocabularies, portion defaults, and audit history. RLS
          enforces every write; this UI is admin-gated for convenience.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2"
        role="tablist"
        aria-label="Admin sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`admin-tab-${t.id}`}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === t.id
                ? "bg-emerald-50 text-emerald-900"
                : "text-zinc-600 hover:bg-zinc-100",
            ].join(" ")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "invites" && (
        <div className="space-y-6" data-testid="admin-section-invites">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Pending invites</CardTitle>
              <Button
                size="sm"
                onClick={() => setInviteOpen(true)}
                data-testid="open-invite-dialog"
              >
                Invite someone
              </Button>
            </CardHeader>
            <CardContent>
              {invitesQuery.isLoading ? (
                <p className="text-sm text-zinc-500">Loading invites…</p>
              ) : pendingInvites.length === 0 ? (
                <p className="text-sm text-zinc-500">No pending invites.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="py-1 pr-2">Email</th>
                        <th className="py-1 pr-2">Household</th>
                        <th className="py-1 pr-2">Role</th>
                        <th className="py-1 pr-2">Created</th>
                        <th className="py-1"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingInvites.map((inv) => (
                        <tr
                          key={inv.id}
                          className="border-t border-zinc-100"
                          data-testid={`pending-invite-${inv.id}`}
                        >
                          <td className="py-2 pr-2">{inv.email}</td>
                          <td className="py-2 pr-2">
                            {inv.householdName ?? inv.householdId}
                          </td>
                          <td className="py-2 pr-2">{inv.role}</td>
                          <td className="py-2 pr-2">
                            {new Date(inv.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={revokeInvite.isPending}
                              onClick={() =>
                                revokeInvite.mutate({ id: inv.id })
                              }
                              data-testid={`revoke-invite-${inv.id}`}
                            >
                              Revoke
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accepted history</CardTitle>
            </CardHeader>
            <CardContent>
              {acceptedInvites.length === 0 ? (
                <p className="text-sm text-zinc-500">No accepted invites yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {acceptedInvites.map((inv) => (
                    <li key={inv.id} data-testid={`accepted-invite-${inv.id}`}>
                      {inv.email} → {inv.householdName ?? inv.householdId} (
                      {inv.role}) ·{" "}
                      {inv.acceptedAt
                        ? new Date(inv.acceptedAt).toLocaleString()
                        : "—"}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent>
              {membersQuery.isLoading ? (
                <p className="text-sm text-zinc-500">Loading members…</p>
              ) : (
                <ul className="space-y-2 text-sm" data-testid="members-list">
                  {(membersQuery.data ?? []).map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center gap-2"
                      data-testid={`member-${m.id}`}
                    >
                      <span className="font-medium">{m.displayName}</span>
                      <Badge>{m.role}</Badge>
                      <span className="text-zinc-500">
                        {householdNameById.get(m.householdId) ?? m.householdId}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <HouseholdsInline
            households={householdsQuery.data ?? []}
            onCreate={(name) => createHousehold.mutate({ name })}
            onRename={(id, name) => renameHousehold.mutate({ id, name })}
            onSetActive={(id, isActive) =>
              setHouseholdActive.mutate({ id, isActive })
            }
          />
        </div>
      )}

      {tab === "portions" && (
        <Card data-testid="admin-section-portions">
          <CardHeader>
            <CardTitle>Portion categories</CardTitle>
          </CardHeader>
          <CardContent>
            {portionsQuery.isLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : (
              <PortionCategoriesPanel
                categories={portionsQuery.data ?? []}
                isSaving={
                  updatePortion.isPending ||
                  createPortion.isPending ||
                  setPortionActive.isPending
                }
                onUpdate={(input) => updatePortion.mutate(input)}
                onCreate={(input) => createPortion.mutate(input)}
                onSetActive={(id, isActive) =>
                  setPortionActive.mutate({ id, isActive })
                }
              />
            )}
          </CardContent>
        </Card>
      )}

      {tab === "units" && (
        <div className="space-y-4" data-testid="admin-section-units">
          <p
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            data-testid="units-factor-warning"
          >
            Conversion factors (<code>factor_to_base</code>) are
            conversion-critical. Incorrect values break shopping-list unit
            display and recipe quantities. Base units: mass→gram, volume→ml,
            count→each.
          </p>
          {unitsQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading units…</p>
          ) : (
            (["mass", "volume", "count"] as const).map((dim) => (
              <Card key={dim}>
                <CardHeader>
                  <CardTitle className="capitalize">{dim}</CardTitle>
                </CardHeader>
                <CardContent>
                  <UnitsTable
                    units={unitsByDimension[dim] ?? []}
                    onToggle={(id, isActive) =>
                      setUnitActive.mutate({ id, isActive })
                    }
                    onUpdate={(input) => updateUnit.mutate(input)}
                  />
                  <UnitCreateForm
                    dimension={dim}
                    onCreate={(input) => createUnit.mutate(input)}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "taxonomy" && (
        <div className="space-y-6" data-testid="admin-section-taxonomy">
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-zinc-500">
                Add child, rename, reorder, deactivate. Reparenting is deferred
                for a later release.
              </p>
              {categoriesQuery.isLoading ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : (
                <CategoryTreeEditor
                  flat={categoriesQuery.data?.flat ?? []}
                  onCreate={(input) => createCategory.mutate(input)}
                  onRename={(id, name) =>
                    updateCategory.mutate({ id, name })
                  }
                  onDeactivate={(id) => deactivateCategory.mutate({ id })}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              {tagsQuery.isLoading ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : (
                <TagsEditor
                  tags={tagsQuery.data ?? []}
                  onCreate={(input) => createTag.mutate(input)}
                  onRename={(id, name) => updateTag.mutate({ id, name })}
                  onDeactivate={(id) => deactivateTag.mutate({ id })}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "settings" && (
        <Card data-testid="admin-section-settings">
          <CardHeader>
            <CardTitle>Family settings</CardTitle>
          </CardHeader>
          <CardContent>
            {settingsQuery.isLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : (
              <FamilySettingsPanel
                settingsId={settingsQuery.data?.id ?? ""}
                athleteMultiplier={
                  settingsQuery.data?.athleteMultiplier ?? 1.5
                }
                isSaving={updateSettings.isPending}
                onSave={(input) => updateSettings.mutate(input)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {tab === "audit" && (
        <Card data-testid="admin-section-audit">
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
          </CardHeader>
          <CardContent>
            {auditQuery.isLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-zinc-500">No audit entries visible.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="py-1 pr-2">When</th>
                      <th className="py-1 pr-2">Who</th>
                      <th className="py-1 pr-2">Table</th>
                      <th className="py-1 pr-2">Action</th>
                      <th className="py-1">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditQuery.data?.items ?? []).map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-zinc-100 align-top"
                        data-testid={`audit-row-${row.id}`}
                      >
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-2 font-mono text-xs">
                          {row.actorId?.slice(0, 8) ?? "—"}
                        </td>
                        <td className="py-2 pr-2">{row.tableName}</td>
                        <td className="py-2 pr-2">{row.action}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="text-xs text-emerald-700 underline"
                            data-testid={`audit-expand-${row.id}`}
                            onClick={() =>
                              setExpandedAudit((id) =>
                                id === row.id ? null : row.id,
                              )
                            }
                          >
                            {expandedAudit === row.id ? "Hide" : "Before/after"}
                          </button>
                          {expandedAudit === row.id && (
                            <div
                              className="mt-2 grid gap-2 sm:grid-cols-2"
                              data-testid={`audit-diff-${row.id}`}
                            >
                              <pre className="max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-[10px]">
                                {JSON.stringify(row.beforeData, null, 2) ??
                                  "null"}
                              </pre>
                              <pre className="max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-[10px]">
                                {JSON.stringify(row.afterData, null, 2) ??
                                  "null"}
                              </pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <InviteDialog
        open={inviteOpen}
        households={(householdsQuery.data ?? []).filter((h) => h.isActive)}
        onClose={() => setInviteOpen(false)}
        isSubmitting={createInvite.isPending}
        errorMessage={
          createInvite.isError ? createInvite.error.message : null
        }
        onSubmit={(payload) => createInvite.mutate(payload)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local subcomponents
// ---------------------------------------------------------------------------

function HouseholdsInline({
  households,
  onCreate,
  onRename,
  onSetActive,
}: {
  households: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onSetActive: (id: string, isActive: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Households</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2 text-sm">
          {households.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center gap-2"
              data-testid={`household-${h.id}`}
            >
              <Input
                className="h-8 w-48"
                value={renameDrafts[h.id] ?? h.name}
                onChange={(e) =>
                  setRenameDrafts((d) => ({ ...d, [h.id]: e.target.value }))
                }
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onRename(h.id, (renameDrafts[h.id] ?? h.name).trim())
                }
              >
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSetActive(h.id, !h.isActive)}
              >
                {h.isActive ? "Deactivate" : "Activate"}
              </Button>
              {!h.isActive && <Badge>Inactive</Badge>}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onCreate(name.trim());
            setName("");
          }}
        >
          <Input
            placeholder="New household name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="new-household-name"
            className="h-9 max-w-xs"
          />
          <Button type="submit" size="sm">
            Add household
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UnitsTable({
  units,
  onToggle,
  onUpdate,
}: {
  units: Array<{
    id: string;
    name: string;
    abbreviation: string;
    factorToBase: number;
    isActive: boolean;
  }>;
  onToggle: (id: string, isActive: boolean) => void;
  onUpdate: (input: {
    id: string;
    name?: string;
    abbreviation?: string;
    factorToBase?: number;
  }) => void;
}) {
  return (
    <table className="mb-3 w-full text-left text-sm">
      <thead className="text-xs uppercase text-zinc-500">
        <tr>
          <th className="py-1 pr-2">Name</th>
          <th className="py-1 pr-2">Abbr</th>
          <th className="py-1 pr-2">Factor</th>
          <th className="py-1">Actions</th>
        </tr>
      </thead>
      <tbody>
        {units.map((u) => (
          <UnitRow key={u.id} unit={u} onToggle={onToggle} onUpdate={onUpdate} />
        ))}
      </tbody>
    </table>
  );
}

function UnitRow({
  unit,
  onToggle,
  onUpdate,
}: {
  unit: {
    id: string;
    name: string;
    abbreviation: string;
    factorToBase: number;
    isActive: boolean;
  };
  onToggle: (id: string, isActive: boolean) => void;
  onUpdate: (input: {
    id: string;
    name?: string;
    abbreviation?: string;
    factorToBase?: number;
  }) => void;
}) {
  const [name, setName] = useState(unit.name);
  const [abbr, setAbbr] = useState(unit.abbreviation);
  const [factor, setFactor] = useState(String(unit.factorToBase));

  return (
    <tr className="border-t border-zinc-100" data-testid={`unit-row-${unit.id}`}>
      <td className="py-1 pr-2">
        <Input
          className="h-8"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td className="py-1 pr-2">
        <Input
          className="h-8 w-20"
          value={abbr}
          onChange={(e) => setAbbr(e.target.value)}
        />
      </td>
      <td className="py-1 pr-2">
        <Input
          className="h-8 w-28"
          type="number"
          step="any"
          value={factor}
          onChange={(e) => setFactor(e.target.value)}
        />
      </td>
      <td className="py-1">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const f = Number(factor);
              if (!Number.isFinite(f) || f <= 0) return;
              onUpdate({
                id: unit.id,
                name: name.trim(),
                abbreviation: abbr.trim(),
                factorToBase: f,
              });
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onToggle(unit.id, !unit.isActive)}
          >
            {unit.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function UnitCreateForm({
  dimension,
  onCreate,
}: {
  dimension: "mass" | "volume" | "count";
  onCreate: (input: {
    name: string;
    abbreviation: string;
    dimension: "mass" | "volume" | "count";
    factorToBase: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [factor, setFactor] = useState("1");

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-dashed border-zinc-200 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Number(factor);
        if (!name.trim() || !abbr.trim() || !Number.isFinite(f) || f <= 0)
          return;
        onCreate({
          name: name.trim(),
          abbreviation: abbr.trim(),
          dimension,
          factorToBase: f,
        });
        setName("");
        setAbbr("");
        setFactor("1");
      }}
    >
      <Input
        placeholder="Name"
        className="h-8 w-32"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="Abbr"
        className="h-8 w-20"
        value={abbr}
        onChange={(e) => setAbbr(e.target.value)}
      />
      <Input
        placeholder="Factor"
        type="number"
        step="any"
        className="h-8 w-24"
        value={factor}
        onChange={(e) => setFactor(e.target.value)}
      />
      <Button type="submit" size="sm">
        Add {dimension} unit
      </Button>
    </form>
  );
}

function CategoryTreeEditor({
  flat,
  onCreate,
  onRename,
  onDeactivate,
}: {
  flat: Array<{
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    sortOrder: number;
    isActive: boolean;
  }>;
  onCreate: (input: {
    name: string;
    slug: string;
    parentId?: string | null;
    sortOrder?: number;
  }) => void;
  onRename: (id: string, name: string) => void;
  onDeactivate: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const roots = flat.filter((c) => !c.parentId);
  const childrenOf = (id: string) => flat.filter((c) => c.parentId === id);

  function renderNode(c: (typeof flat)[0], depth: number) {
    return (
      <li key={c.id} style={{ marginLeft: depth * 16 }}>
        <div
          className="flex flex-wrap items-center gap-2 py-1"
          data-testid={`category-node-${c.slug}`}
        >
          <Input
            className="h-8 w-48"
            value={renameDrafts[c.id] ?? c.name}
            onChange={(e) =>
              setRenameDrafts((d) => ({ ...d, [c.id]: e.target.value }))
            }
          />
          {!c.isActive && <Badge>Inactive</Badge>}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onRename(c.id, (renameDrafts[c.id] ?? c.name).trim())
            }
          >
            Rename
          </Button>
          {c.isActive && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDeactivate(c.id)}
            >
              Deactivate
            </Button>
          )}
        </div>
        <ul>{childrenOf(c.id).map((ch) => renderNode(ch, depth + 1))}</ul>
      </li>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="text-sm">{roots.map((r) => renderNode(r, 0))}</ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          const slug = slugifyName(name);
          if (!slug) return;
          onCreate({
            name,
            slug,
            parentId: parentId || null,
            sortOrder: flat.length * 10,
          });
          setNewName("");
          setParentId("");
        }}
      >
        <Input
          placeholder="New category"
          className="h-8 w-40"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          data-testid="new-category-name"
        />
        <select
          className="h-8 rounded-md border border-zinc-300 px-2 text-sm"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          data-testid="new-category-parent"
        >
          <option value="">Top-level</option>
          {flat.map((c) => (
            <option key={c.id} value={c.id}>
              Child of {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm">
          Add category
        </Button>
      </form>
    </div>
  );
}

function TagsEditor({
  tags,
  onCreate,
  onRename,
  onDeactivate,
}: {
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    tagGroup: string;
    isActive: boolean;
  }>;
  onCreate: (input: {
    name: string;
    slug: string;
    tagGroup: string;
  }) => void;
  onRename: (id: string, name: string) => void;
  onDeactivate: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("cuisine");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const byGroup = useMemo(() => {
    const m = new Map<string, typeof tags>();
    for (const t of tags) {
      const list = m.get(t.tagGroup) ?? [];
      list.push(t);
      m.set(t.tagGroup, list);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tags]);

  return (
    <div className="space-y-4">
      {byGroup.map(([g, list]) => (
        <div key={g}>
          <h4 className="mb-1 text-xs font-semibold uppercase text-zinc-500">
            {g}
          </h4>
          <ul className="space-y-1 text-sm">
            {list.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-2"
                data-testid={`tag-${t.slug}`}
              >
                <Input
                  className="h-8 w-40"
                  value={renameDrafts[t.id] ?? t.name}
                  onChange={(e) =>
                    setRenameDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                  }
                />
                {!t.isActive && <Badge>Inactive</Badge>}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onRename(t.id, (renameDrafts[t.id] ?? t.name).trim())
                  }
                >
                  Rename
                </Button>
                {t.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDeactivate(t.id)}
                  >
                    Deactivate
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          const slug = slugifyName(n);
          if (!slug) return;
          onCreate({ name: n, slug, tagGroup: group.trim() || "general" });
          setName("");
        }}
      >
        <Input
          placeholder="Tag name"
          className="h-8 w-36"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="new-tag-name"
        />
        <Input
          placeholder="Group"
          className="h-8 w-32"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          data-testid="new-tag-group"
        />
        <Button type="submit" size="sm">
          Add tag
        </Button>
      </form>
    </div>
  );
}
