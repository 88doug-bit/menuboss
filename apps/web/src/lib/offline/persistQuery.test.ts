/**
 * Unit tests for offline query persistence filter (D4).
 */
import { describe, expect, it } from "vitest";
import type { Query } from "@tanstack/react-query";

import { shouldPersistQuery } from "./persistQuery";

function fakeQuery(
  queryKey: unknown[],
  status: "success" | "pending" | "error" = "success",
): Query {
  return {
    queryKey,
    state: { status },
  } as unknown as Query;
}

describe("shouldPersistQuery", () => {
  it("persists successful recipe list queries", () => {
    expect(
      shouldPersistQuery(
        fakeQuery([["recipe", "list"], { input: { limit: 20 }, type: "query" }]),
      ),
    ).toBe(true);
  });

  it("rejects mutations", () => {
    expect(
      shouldPersistQuery(
        fakeQuery([
          ["recipe", "create"],
          { input: {}, type: "mutation" },
        ]),
      ),
    ).toBe(false);
  });

  it("rejects non-success states", () => {
    expect(
      shouldPersistQuery(
        fakeQuery([["recipe", "list"], { type: "query" }], "pending"),
      ),
    ).toBe(false);
  });

  it("rejects routers outside the read-offline set", () => {
    expect(
      shouldPersistQuery(
        fakeQuery([["health", "ping"], { type: "query" }]),
      ),
    ).toBe(false);
  });
});
