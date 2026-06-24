/**
 * Barrel re-export — the canonical wire/business types now live in `domain/`.
 * Kept here so existing `./types.js` import sites keep compiling during the
 * layered refactor. New code should import from `./domain/index.js`.
 */
export * from "./domain/types.js";
