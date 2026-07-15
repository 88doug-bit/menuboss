/**
 * Debounced invalidation unit tests (fake timers).
 * Full channel wiring is covered by E2E; here we prove the debounce seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedInvalidator } from "./useRealtimePlanInvalidation";

describe("createDebouncedInvalidator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces bursts to a single invalidate after 250ms", () => {
    const invalidate = vi.fn();
    const inv = createDebouncedInvalidator(invalidate, 250);

    inv.notify();
    inv.notify();
    inv.notify();

    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(249);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledTimes(1);

    inv.dispose();
  });

  it("resets the debounce window on each notify", () => {
    const invalidate = vi.fn();
    const inv = createDebouncedInvalidator(invalidate, 250);

    inv.notify();
    vi.advanceTimersByTime(200);
    inv.notify();
    vi.advanceTimersByTime(200);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(invalidate).toHaveBeenCalledTimes(1);

    inv.dispose();
  });

  it("dispose cancels a pending invalidate", () => {
    const invalidate = vi.fn();
    const inv = createDebouncedInvalidator(invalidate, 250);
    inv.notify();
    inv.dispose();
    vi.advanceTimersByTime(500);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never receives event payloads (notify takes no args)", () => {
    const invalidate = vi.fn();
    const inv = createDebouncedInvalidator(invalidate, 250);
    // Signature is notify(): void — callers must not pass payloads.
    inv.notify();
    vi.advanceTimersByTime(250);
    expect(invalidate).toHaveBeenCalledWith();
    inv.dispose();
  });
});
