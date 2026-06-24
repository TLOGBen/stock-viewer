import { promises as fs } from "node:fs";
import path from "node:path";
import type { UniverseSnapshot } from "../domain/index.js";

/**
 * Atomic on-disk cache of the securities universe at {dataDir}/universe.json.
 * Writes go to a tmp file then rename() so a crash mid-write cannot corrupt
 * the live cache. Reads tolerate a missing/garbage file by returning null.
 */

const FILE_NAME = "universe.json";

function cachePath(dataDir: string): string {
  return path.join(dataDir, FILE_NAME);
}

/** A persisted universe snapshot is structurally a UniverseSnapshot. */
function isSnapshot(v: unknown): v is UniverseSnapshot {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o["asOf"] === "number" && Array.isArray(o["securities"]);
}

/** Read the cached universe, or null when absent/unreadable/malformed. */
export async function readUniverseCache(
  dataDir: string,
): Promise<UniverseSnapshot | null> {
  try {
    const raw = await fs.readFile(cachePath(dataDir), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) {
      console.error("[universe] cache file malformed, ignoring");
      return null;
    }
    return parsed;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.error("[universe] cache read failed:", err);
    }
    return null;
  }
}

/** Atomically write the universe snapshot (tmp file + rename). */
export async function writeUniverseCache(
  dataDir: string,
  snapshot: UniverseSnapshot,
): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const target = cachePath(dataDir);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify(snapshot);
  try {
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, target);
  } catch (err) {
    // Best-effort cleanup of the orphaned tmp file.
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

/** True when a snapshot sourced at `asOf` is still within `ttlMs` of `now`. */
export function isFresh(asOf: number, ttlMs: number, now: number): boolean {
  if (!Number.isFinite(asOf) || !Number.isFinite(ttlMs)) return false;
  return now - asOf < ttlMs;
}
