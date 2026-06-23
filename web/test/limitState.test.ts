import { describe, it, expect } from "vitest";
import { limitStateOf } from "../utils/limitState";

/** Build a minimal quote-shaped object for the pure classifier. */
function q(price: number | null, limitUp: number | null, limitDown: number | null) {
  return { price, limitUp, limitDown };
}

describe("limitStateOf", () => {
  it("returns lock-up when price equals limitUp", () => {
    expect(limitStateOf(q(110, 110, 90))).toBe("lock-up");
  });

  it("returns lock-up when price exceeds limitUp", () => {
    expect(limitStateOf(q(110.5, 110, 90))).toBe("lock-up");
  });

  it("returns lock-down when price equals limitDown", () => {
    expect(limitStateOf(q(90, 110, 90))).toBe("lock-down");
  });

  it("returns lock-down when price is below limitDown", () => {
    expect(limitStateOf(q(89.5, 110, 90))).toBe("lock-down");
  });

  it("returns null when price is between the limits", () => {
    expect(limitStateOf(q(100, 110, 90))).toBeNull();
  });

  it("returns null when price is null", () => {
    expect(limitStateOf(q(null, 110, 90))).toBeNull();
  });

  it("returns null when both limits are null", () => {
    expect(limitStateOf(q(100, null, null))).toBeNull();
  });

  it("returns null when price is non-finite", () => {
    expect(limitStateOf(q(Number.NaN, 110, 90))).toBeNull();
  });

  it("ignores a null limitUp but still detects lock-down", () => {
    expect(limitStateOf(q(90, null, 90))).toBe("lock-down");
  });

  it("ignores a null limitDown but still detects lock-up", () => {
    expect(limitStateOf(q(110, 110, null))).toBe("lock-up");
  });

  it("locks up at the epsilon boundary (a hair below limitUp)", () => {
    // 110 - 5e-5 is within the 1e-4 tolerance ⇒ counts as locked up.
    expect(limitStateOf(q(110 - 5e-5, 110, 90))).toBe("lock-up");
  });

  it("does NOT lock up just outside the epsilon tolerance", () => {
    // 110 - 0.01 (one full tick below) is clearly not locked.
    expect(limitStateOf(q(110 - 0.01, 110, 90))).toBeNull();
  });

  it("locks down at the epsilon boundary (a hair above limitDown)", () => {
    expect(limitStateOf(q(90 + 5e-5, 110, 90))).toBe("lock-down");
  });

  it("prefers lock-up when limits are degenerate (price >= up wins ordering)", () => {
    // Defensive: with inverted/degenerate limits the up-check runs first.
    expect(limitStateOf(q(100, 90, 110))).toBe("lock-up");
  });
});
