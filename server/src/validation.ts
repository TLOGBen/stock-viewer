/**
 * Symbol format guard. Taiwan security codes are short alphanumeric tokens
 * (e.g. 2330, 0050, 00878, 6488). Rejecting anything else at every system
 * boundary keeps user-supplied symbols out of filesystem paths and upstream
 * URLs — in particular it stops a crafted `req.params.symbol` like
 * "../../watchlist" from reaching the on-disk k-line cache (path traversal).
 */
export const SYMBOL_PATTERN = /^[0-9A-Za-z]{1,10}$/;

/** True when `symbol` is a well-formed Taiwan security code. */
export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol);
}
