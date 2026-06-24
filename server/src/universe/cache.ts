/**
 * Barrel re-export — the atomic on-disk universe cache now lives in
 * `persistence/`. Kept here so existing `./cache.js` import sites keep compiling
 * during the layered refactor. New code should import from
 * `../persistence/index.js`.
 */
export {
  readUniverseCache,
  writeUniverseCache,
  isFresh,
} from "../persistence/universeCache.js";
