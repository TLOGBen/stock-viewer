import type { Request, Response, NextFunction, RequestHandler } from "express";
import { isValidSymbol } from "../domain/index.js";

/**
 * middleware/validateSymbol — request-boundary guard wrapping the pure
 * `domain/validation.isValidSymbol`. Rejects a malformed `:symbol` route
 * param with a 400 (uniform error shape) before it can reach an on-disk
 * cache path (path-traversal guard; Express URL-decodes %2f in route params).
 *
 * Behaviour matches the inline checks the routes used previously: same 400
 * status and same `{ error: "Invalid symbol: <symbol>" }` body, so the
 * external contract is unchanged.
 */
export function validateSymbol(param = "symbol"): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const symbol = req.params[param];
    if (typeof symbol !== "string" || !isValidSymbol(symbol)) {
      res.status(400).json({ error: `Invalid symbol: ${symbol ?? ""}` });
      return;
    }
    next();
  };
}
