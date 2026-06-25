import { describe, expect, it } from "vitest";

import { upsertSeries } from "../src/domain/series.js";

interface Period {
  period: string;
  value: number;
}
const key = (p: Period): string => p.period;

describe("upsertSeries — key-deduped, capped, immutable fold", () => {
  it("appends a new period", () => {
    const a: Period = { period: "2026Q1", value: 1 };
    const b: Period = { period: "2026Q2", value: 2 };
    expect(upsertSeries([a], b, key, 10)).toEqual([a, b]);
  });

  it("replaces an existing period (latest write wins), keeping order at the end", () => {
    const a: Period = { period: "2026Q1", value: 1 };
    const b: Period = { period: "2026Q2", value: 2 };
    const a2: Period = { period: "2026Q1", value: 99 };
    expect(upsertSeries([a, b], a2, key, 10)).toEqual([b, a2]);
  });

  it("trims from the front once the cap is exceeded", () => {
    const list = [
      { period: "1", value: 1 },
      { period: "2", value: 2 },
      { period: "3", value: 3 },
    ];
    const next = upsertSeries(list, { period: "4", value: 4 }, key, 3);
    expect(next.map((p) => p.period)).toEqual(["2", "3", "4"]);
  });

  it("cap <= 0 disables trimming", () => {
    const list = [{ period: "1", value: 1 }];
    expect(upsertSeries(list, { period: "2", value: 2 }, key, 0)).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const list = [{ period: "1", value: 1 }];
    const frozen = Object.freeze([...list]);
    upsertSeries(frozen, { period: "2", value: 2 }, key, 10);
    expect(frozen).toHaveLength(1);
  });
});
