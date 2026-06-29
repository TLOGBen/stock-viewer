import { promises as fs } from "node:fs";
import path from "node:path";
import {
  emptyBook,
  normalizePositionBook,
  type PositionBook,
} from "../domain/index.js";

/**
 * Persistent mock position book: the open positions + buying power stored
 * atomically at {dataDir}/positions.json as { positions, cashBalance, updatedAt }.
 * An absent or malformed file degrades to an empty book (no reseed needed — the
 * empty book IS the default). Validation lives in `domain/normalizePositionBook`;
 * this store only persists/loads. Read/parse never throws.
 */

const FILE_NAME = "positions.json";

interface PositionBookFile {
  positions: PositionBook["positions"];
  cashBalance: number;
  updatedAt: number;
}

function filePath(dataDir: string): string {
  return path.join(dataDir, FILE_NAME);
}

export class PositionBookStore {
  private book: PositionBook = emptyBook();
  private updatedAt = 0;

  constructor(private readonly dataDir: string) {}

  /** Load from disk; an absent/malformed file degrades to an empty book. */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(filePath(this.dataDir), "utf8");
      const parsed: unknown = JSON.parse(raw);
      this.book = normalizePositionBook(parsed);
      const at = (parsed as Record<string, unknown> | null)?.["updatedAt"];
      this.updatedAt = typeof at === "number" ? at : 0;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error("[positions] read failed, starting empty:", err);
      }
      this.book = emptyBook();
      this.updatedAt = 0;
    }
  }

  /** Current book (defensive shallow copy of the positions record). */
  get(): PositionBook {
    return {
      positions: { ...this.book.positions },
      cashBalance: this.book.cashBalance,
    };
  }

  updatedAtMs(): number {
    return this.updatedAt;
  }

  /** Replace the book with a normalized value and persist atomically. */
  async set(book: PositionBook): Promise<void> {
    const normalized = normalizePositionBook(book);
    const updatedAt = Date.now();
    const body: PositionBookFile = {
      positions: normalized.positions,
      cashBalance: normalized.cashBalance,
      updatedAt,
    };
    await fs.mkdir(this.dataDir, { recursive: true });
    const target = filePath(this.dataDir);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(body), "utf8");
      await fs.rename(tmp, target);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
    // Commit in-memory state only after a successful write.
    this.book = normalized;
    this.updatedAt = updatedAt;
  }
}
