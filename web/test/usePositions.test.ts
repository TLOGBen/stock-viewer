import { describe, it, expect } from "vitest";
import { usePositions } from "../composables/usePositions";

// usePositions is a module-scoped singleton; these tests exercise the manual
// 可用資金 override (setCashBalance) and its input guards. Cases mutate shared
// state, so each asserts against the value it just set rather than a fixed seed.
describe("usePositions — setCashBalance (manual 可用資金 override)", () => {
  it("sets an arbitrary positive balance for what-if simulations", () => {
    const pos = usePositions();
    pos.setCashBalance(5_000_000);
    expect(pos.cashBalance.value).toBe(5_000_000);
  });

  it("allows zero (fully invested)", () => {
    const pos = usePositions();
    pos.setCashBalance(0);
    expect(pos.cashBalance.value).toBe(0);
  });

  it("ignores negative amounts", () => {
    const pos = usePositions();
    pos.setCashBalance(1_234);
    pos.setCashBalance(-1);
    expect(pos.cashBalance.value).toBe(1_234);
  });

  it("ignores NaN / non-finite input (e.g. a blank edit)", () => {
    const pos = usePositions();
    pos.setCashBalance(7_777);
    pos.setCashBalance(Number.NaN);
    pos.setCashBalance(Number.POSITIVE_INFINITY);
    expect(pos.cashBalance.value).toBe(7_777);
  });
});

describe("usePositions — resetBook (重置模擬)", () => {
  it("clears positions and restores the starting cash (10,000,000)", () => {
    const pos = usePositions();
    pos.submitOrder({ symbol: "2330", side: "buy", lots: 1, price: 1000 });
    pos.setCashBalance(123);
    expect(Object.keys(pos.positions.value).length).toBeGreaterThan(0);

    pos.resetBook();

    expect(pos.positions.value).toEqual({});
    expect(pos.cashBalance.value).toBe(10_000_000);
  });
});
