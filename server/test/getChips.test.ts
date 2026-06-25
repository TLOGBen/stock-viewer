import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getInstitutional, getMargin } from "../src/usecase/index.js";
import {
  BulkByDateCache,
  type BulkByDateFetcher,
} from "../src/persistence/index.js";
import type { InstitutionalFlow, MarginData } from "../src/domain/index.js";

/** 2026-06-24 is a Wednesday — recentTradingDays yields weekday tokens. */
const NOW = new Date(Date.UTC(2026, 5, 24));

describe("usecase/getInstitutional + getMargin (by-date cache A)", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "chips-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("getInstitutional：近 N 日切片，newest-first，已知 945.506 張合計", async () => {
    // 1513 三大法人合計 = 945,506 股 → 945.506 張 (known true value).
    const day0: InstitutionalFlow = {
      foreignNet: 940.0,
      trustNet: 4369.58,
      dealerNet: -10,
      totalNet: 945.506,
    };
    const day1: InstitutionalFlow = {
      foreignNet: 100,
      trustNet: 50,
      dealerNet: 0,
      totalNet: 150,
    };
    const fetchDay: BulkByDateFetcher<InstitutionalFlow> = async (date) => {
      if (date === "20260624") return new Map([["1513", day0]]);
      if (date === "20260623") return new Map([["1513", day1]]);
      return new Map();
    };
    const cache = new BulkByDateCache(dataDir, "t86", fetchDay, 0);

    const view = await getInstitutional({ institutional: cache }, "1513", NOW, 3);
    expect(view.coverage).toBe(true);
    expect(view.days.map((d) => d.date)).toEqual(["20260624", "20260623"]);
    expect(view.days[0]!.totalNet).toBeCloseTo(945.506, 3); // newest-first
  });

  it("getInstitutional：冷啟動單日 → 單點序列（不偽裝歷史）", async () => {
    const fetchDay: BulkByDateFetcher<InstitutionalFlow> = async (date) =>
      date === "20260624"
        ? new Map([["1513", { foreignNet: 1, trustNet: 1, dealerNet: 1, totalNet: 3 }]])
        : new Map();
    const cache = new BulkByDateCache(dataDir, "t86", fetchDay, 0);
    const view = await getInstitutional({ institutional: cache }, "1513", NOW, 5);
    expect(view.days).toHaveLength(1);
  });

  it("getInstitutional：symbol 不在任何日 → coverage:false", async () => {
    const cache = new BulkByDateCache<InstitutionalFlow>(
      dataDir,
      "t86",
      async () => new Map(),
      0,
    );
    const view = await getInstitutional({ institutional: cache }, "9999", NOW, 3);
    expect(view.coverage).toBe(false);
    expect(view.days).toEqual([]);
  });

  it("getMargin：餘額為張（不除 1000），券資比由 parser 帶出", async () => {
    // 1513 融資今日餘額 10160 張, 融券今日餘額 89 張 (known true values).
    const m: MarginData = {
      marginBalance: 10160,
      shortBalance: 89,
      shortMarginRatioPct: (89 / 10160) * 100,
    };
    const fetchDay: BulkByDateFetcher<MarginData> = async (date) =>
      date === "20260624" ? new Map([["1513", m]]) : new Map();
    const cache = new BulkByDateCache(dataDir, "margin", fetchDay, 0);

    const view = await getMargin({ margin: cache }, "1513", NOW, 3);
    expect(view.coverage).toBe(true);
    expect(view.days[0]!.marginBalance).toBe(10160); // 張, not /1000
    expect(view.days[0]!.shortMarginRatioPct).toBeCloseTo((89 / 10160) * 100, 6);
  });

  it("getMargin：一日抓取失敗不拖垮其餘日（cache 跳過空 map）+ never throw", async () => {
    const fetchDay: BulkByDateFetcher<MarginData> = async (date) => {
      if (date === "20260623") throw new Error("missing day");
      return new Map([
        ["1513", { marginBalance: 1, shortBalance: 0, shortMarginRatioPct: 0 }],
      ]);
    };
    const cache = new BulkByDateCache(dataDir, "margin", fetchDay, 0);
    const view = await getMargin({ margin: cache }, "1513", NOW, 3);
    // 20260623 失敗被跳過，其餘兩日仍在。
    expect(view.days.map((d) => d.date)).not.toContain("20260623");
    expect(view.days.length).toBeGreaterThanOrEqual(1);
  });
});
