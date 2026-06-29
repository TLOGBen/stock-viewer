import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PositionBookStore } from "../src/persistence/index.js";
import { DEFAULT_CASH, type PositionBook } from "../src/domain/index.js";

const SAMPLE: PositionBook = {
  positions: {
    "2330": { symbol: "2330", lots: 2, avgPrice: 1000, realized: 5000 },
    "8299": { symbol: "8299", lots: -1, avgPrice: 2500, realized: 0 },
  },
  cashBalance: 7_500_000,
};

describe("PositionBookStore — file persistence", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "positions-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("loads an empty default book when no file exists", async () => {
    const store = new PositionBookStore(dataDir);
    await store.load();
    expect(store.get()).toEqual({ positions: {}, cashBalance: DEFAULT_CASH });
    expect(store.updatedAtMs()).toBe(0);
  });

  it("persists a book atomically and reloads it across instances", async () => {
    const store = new PositionBookStore(dataDir);
    await store.load();
    await store.set(SAMPLE);

    // A file is present (atomic write left no .tmp behind).
    const files = await fs.readdir(dataDir);
    expect(files).toEqual(["positions.json"]);

    const reloaded = new PositionBookStore(dataDir);
    await reloaded.load();
    expect(reloaded.get()).toEqual(SAMPLE);
    expect(reloaded.updatedAtMs()).toBeGreaterThan(0);
  });

  it("normalizes on write — a negative cash / malformed position is sanitized", async () => {
    const store = new PositionBookStore(dataDir);
    await store.set({
      positions: {
        ok: { symbol: "ok", lots: 1, avgPrice: 10, realized: 0 },
        // @ts-expect-error — deliberately malformed to exercise the boundary.
        bad: { symbol: "bad", lots: "x", avgPrice: 10, realized: 0 },
      },
      cashBalance: -999,
    });
    expect(store.get()).toEqual({
      positions: { ok: { symbol: "ok", lots: 1, avgPrice: 10, realized: 0 } },
      cashBalance: DEFAULT_CASH,
    });
  });

  it("degrades to an empty book when the file is malformed JSON (never throws)", async () => {
    await fs.writeFile(path.join(dataDir, "positions.json"), "{not json", "utf8");
    const store = new PositionBookStore(dataDir);
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.get()).toEqual({ positions: {}, cashBalance: DEFAULT_CASH });
  });

  it("get() returns a defensive copy — mutating it does not corrupt the store", async () => {
    const store = new PositionBookStore(dataDir);
    await store.set(SAMPLE);
    const snap = store.get();
    delete snap.positions["2330"];
    snap.cashBalance = 0;
    expect(store.get()).toEqual(SAMPLE);
  });
});
