/**
 * @vitest-environment jsdom
 *
 * Non-admin sees "admins only" when family.me role is member.
 * Admin path is not fully integration-tested here (tRPC mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const meState = vi.hoisted(() => ({
  role: "member" as "admin" | "member",
  loading: false,
}));

vi.mock("@/lib/trpc/client", () => {
  function qOpts() {
    return {
      queryKey: ["mock"],
      queryFn: async () => null,
    };
  }
  function mOpts(opts?: { onSuccess?: () => void }) {
    return {
      mutationKey: ["mock"],
      mutationFn: async () => {
        opts?.onSuccess?.();
        return {};
      },
    };
  }
  return {
    useTRPC: () => ({
      family: {
        me: {
          queryOptions: () => ({
            queryKey: ["family", "me"],
            queryFn: async () => {
              if (meState.loading) {
                // never resolves while loading tests set isLoading via placeholder
                return {
                  profile: {
                    id: "p1",
                    householdId: "h1",
                    displayName: "User",
                    role: meState.role,
                  },
                  household: null,
                };
              }
              return {
                profile: {
                  id: "p1",
                  householdId: "h1",
                  displayName: "User",
                  role: meState.role,
                },
                household: null,
              };
            },
          }),
        },
      },
      admin: {
        invites: {
          list: { queryOptions: qOpts },
          create: { mutationOptions: mOpts },
          revoke: { mutationOptions: mOpts },
        },
        households: {
          list: { queryOptions: qOpts },
          create: { mutationOptions: mOpts },
          rename: { mutationOptions: mOpts },
          setActive: { mutationOptions: mOpts },
        },
        members: { list: { queryOptions: qOpts } },
        portionCategories: {
          list: { queryOptions: qOpts },
          create: { mutationOptions: mOpts },
          update: { mutationOptions: mOpts },
          setActive: { mutationOptions: mOpts },
        },
        units: {
          list: { queryOptions: qOpts },
          create: { mutationOptions: mOpts },
          update: { mutationOptions: mOpts },
          setActive: { mutationOptions: mOpts },
        },
        familySettings: {
          get: { queryOptions: qOpts },
          update: { mutationOptions: mOpts },
        },
        audit: { list: { queryOptions: qOpts } },
      },
      category: {
        list: { queryOptions: qOpts },
        create: { mutationOptions: mOpts },
        update: { mutationOptions: mOpts },
        deactivate: { mutationOptions: mOpts },
      },
      tag: {
        list: { queryOptions: qOpts },
        create: { mutationOptions: mOpts },
        update: { mutationOptions: mOpts },
        deactivate: { mutationOptions: mOpts },
      },
    }),
  };
});

import { AdminPage } from "./AdminPage";

function renderAdmin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

describe("AdminPage role gate", () => {
  beforeEach(() => {
    meState.role = "member";
    meState.loading = false;
  });

  it("shows admins-only state for non-admin role", async () => {
    meState.role = "member";
    renderAdmin();
    expect(await screen.findByTestId("admins-only")).toBeTruthy();
    expect(screen.getByTestId("admins-only")).toHaveTextContent(/admins only/i);
    expect(screen.queryByTestId("admin-page")).toBeNull();
  });

  it("shows admin hub when role is admin", async () => {
    meState.role = "admin";
    renderAdmin();
    expect(await screen.findByTestId("admin-page")).toBeTruthy();
    expect(screen.queryByTestId("admins-only")).toBeNull();
  });
});
