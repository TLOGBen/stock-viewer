import cors from "cors";
import type { RequestHandler } from "express";
import { config } from "../config.js";

/**
 * middleware/cors — CORS allowlist for the Nuxt dev origin(s).
 * Wraps the `cors` package with the configured origin so the action layer
 * never references the CORS implementation directly.
 */
export function corsMiddleware(): RequestHandler {
  return cors({ origin: config.corsOrigin });
}
