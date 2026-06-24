/**
 * Barrel re-export — the symbol guard now lives in `domain/validation.ts`.
 * Kept so existing `./validation.js` import sites keep compiling.
 */
export * from "./domain/validation.js";
