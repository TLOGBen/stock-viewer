import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getDividends } from "../src/usecase/index.js";
import {
  BulkByDateCache,
  type BulkByDateFetcher,
} from "../src/persistence/index.js";
import type { Dividend, ExDividend } from "../src/domain/index.js";

const NOW = new Date(Date.UTC(2026, 5, 24)); // Wednesday

const div1513: Dividend = {
  year: "114",
  period: "1",
  cashDividend: 6.0, // known: 1513 114年度 6.00 元/股 cash
  stockDividend: 0,
  resolutionDate: "1150310",
};

describe("usecase/getDividends", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "div-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns the ap45 series + the latest ex-dividend within the window (N2)", async () => {
    // 除權息 event for 1513 appears on the most recent day only.
    const ev: ExDividend = {
      date: Date.UTC(2026, 5, 24),
      refPriceBefore: 100,
      refPrice: 94,
      value: 6,
      kind: "息",
    };
    const fetchDay: BulkByDateFetcher<ExDividend> = async (date) =>
      date === "20260624" ? new Map([["1513", ev]]) : new Map();
    const exRight = new BulkByDateCache(dataDir, "twt49u", fetchDay, 0);

    const view = await getDividends(
      { dividends: async () => [div1513], exRight },
      "1513",
      NOW,
      5,
    );
    expect(view.coverage).toBe(true);
    expect(view.series[0]!.cashDividend).toBe(6.0); // 元/股
    expect(view.exDividend?.refPrice).toBe(94);
    expect(view.exDividend?.kind).toBe("息");
  });

  it("no ex-dividend in window → exDividend:null (no heuristic pairing)", async () => {
    const exRight = new BulkByDateCache<ExDividend>(
      dataDir,
      "twt49u",
      async () => new Map(),
      0,
    );
    const view = await getDividends(
      { dividends: async () => [div1513], exRight },
      "1513",
      NOW,
      5,
    );
    expect(view.series).toHaveLength(1);
    expect(view.exDividend).toBeNull();
  });

  it("never throws when the dividend series fetch rejects — coverage:false, ex still resolved", async () => {
    const ev: ExDividend = {
      date: Date.UTC(2026, 5, 24),
      refPriceBefore: 10,
      refPrice: 9,
      value: 1,
      kind: "權",
    };
    const exRight = new BulkByDateCache(
      dataDir,
      "twt49u",
      (async (date: string) =>
        date === "20260624" ? new Map([["1513", ev]]) : new Map()) as BulkByDateFetcher<ExDividend>,
      0,
    );
    const view = await getDividends(
      {
        dividends: async () => {
          throw new Error("ap45 down");
        },
        exRight,
      },
      "1513",
      NOW,
      5,
    );
    expect(view.coverage).toBe(false);
    expect(view.series).toEqual([]);
    expect(view.exDividend?.kind).toBe("權"); // ex-dividend region independent
  });
});
