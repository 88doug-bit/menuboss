import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MakeAgainRating, useOptimisticRating } from "./MakeAgainRating";

describe("useOptimisticRating", () => {
  it("optimistically updates then keeps value on success", async () => {
    const onRate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticRating(2, onRate));

    expect(result.current.value).toBe(2);

    await act(async () => {
      await result.current.rate(5);
    });

    expect(onRate).toHaveBeenCalledWith(5);
    expect(result.current.value).toBe(5);
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("rolls back to previous value when onRate rejects", async () => {
    const onRate = vi.fn().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useOptimisticRating(3, onRate));

    await act(async () => {
      await result.current.rate(5);
    });

    expect(result.current.value).toBe(3);
    expect(result.current.error).toBe("network down");
    expect(result.current.pending).toBe(false);
  });
});

describe("MakeAgainRating", () => {
  it("invokes onRate when a star is tapped", async () => {
    const user = userEvent.setup();
    const onRate = vi.fn().mockResolvedValue(undefined);

    render(<MakeAgainRating value={1} onRate={onRate} />);

    await user.click(screen.getByTestId("rating-star-4"));
    await waitFor(() => {
      expect(onRate).toHaveBeenCalledWith(4);
    });
  });

  it("disables stars while pending", () => {
    render(<MakeAgainRating value={2} onRate={vi.fn()} pending />);
    expect(screen.getByTestId("rating-star-1")).toBeDisabled();
    expect(screen.getByTestId("rating-pending")).toBeInTheDocument();
  });
});
