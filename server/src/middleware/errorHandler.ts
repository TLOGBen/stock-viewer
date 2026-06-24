import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";

/**
 * middleware/errorHandler — unified error terminator for the HTTP entry.
 * Any error thrown from a route (or passed to `next(err)`) is logged on the
 * server and serialized to a uniform JSON error shape. The action layer holds
 * no business logic, so all unexpected failures funnel here.
 *
 * Note: Express identifies an error handler by its 4-arg arity, so the unused
 * `_next` parameter must stay even though it is never called.
 */
export function errorHandler(): ErrorRequestHandler {
  return (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    console.error("[twse-desk] unhandled route error:", err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  };
}
