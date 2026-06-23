import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Persistent watchlist: a single ordered list of symbols stored atomically at
 * {dataDir}/watchlist.json as { symbols, updatedAt }. When the file is absent
 * the store seeds from the provided config seed symbols (config.INSTRUMENTS).
 *
 * Validation of unknown symbols is the REST layer's job; this store persists
 * whatever validated set it is handed.
 */

const FILE_NAME = "watchlist.json";

interface WatchlistFile {
  symbols: string[];
  updatedAt: number;
}

function filePath(dataDir: string): string {
  return path.join(dataDir, FILE_NAME);
}

function isWatchlistFile(v: unknown): v is WatchlistFile {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o["symbols"]) &&
    o["symbols"].every((s) => typeof s === "string")
  );
}

/** Dedupe preserving first-seen order; drop empties. */
function dedupe(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of symbols) {
    const sym = s.trim();
    if (sym === "" || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}

export class WatchlistStore {
  private symbols: string[] = [];
  private updatedAt = 0;

  constructor(
    private readonly dataDir: string,
    private readonly seedSymbols: string[],
  ) {}

  /** Load from disk; seed + persist from config when the file is absent. */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(filePath(this.dataDir), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (isWatchlistFile(parsed)) {
        this.symbols = dedupe(parsed.symbols);
        this.updatedAt =
          typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now();
        return;
      }
      console.error("[watchlist] file malformed, reseeding");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error("[watchlist] read failed, reseeding:", err);
      }
    }
    // Absent or malformed → seed from config and persist.
    await this.persist(dedupe(this.seedSymbols));
  }

  /** Current ordered watchlist (defensive copy). */
  get(): string[] {
    return [...this.symbols];
  }

  updatedAtMs(): number {
    return this.updatedAt;
  }

  /** Replace the watchlist with a validated set and persist atomically. */
  async set(symbols: string[]): Promise<void> {
    await this.persist(dedupe(symbols));
  }

  private async persist(symbols: string[]): Promise<void> {
    const updatedAt = Date.now();
    const body: WatchlistFile = { symbols, updatedAt };
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
    this.symbols = symbols;
    this.updatedAt = updatedAt;
  }
}
