/**
 * Barrel re-export — the tick-size ladder now lives in `domain/tickSize.ts`.
 * Kept so existing `./tickSize.js` import sites (and tests) keep compiling.
 */
export * from "./domain/tickSize.js";
