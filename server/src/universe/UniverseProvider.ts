/**
 * Barrel re-export — the universe application service (`UniverseProvider`) now
 * lives in `usecase/universeService.ts`. Kept here so existing
 * `./universe/UniverseProvider.js` import sites keep compiling during the
 * layered refactor. New code should import from `../usecase/universeService.js`.
 */
export {
  UniverseProvider,
  type UniverseProviderConfig,
} from "../usecase/universeService.js";
