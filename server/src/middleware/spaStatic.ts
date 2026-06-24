import path from "node:path";
import fs from "node:fs";
import express from "express";
import type { Express } from "express";

/**
 * middleware/spaStatic — optional bundled SPA serving (desktop / Electron
 * packaging). When WEB_DIST points at a Nuxt `generate` output, serve it from
 * this same origin with an SPA history fallback, so the whole app is reachable
 * from one local server (no separate web process). Unset in normal dev — Nuxt
 * runs its own dev server then.
 *
 * Behaviour is identical to the previous inline block in index.ts:
 *   - express.static(webDist) for assets
 *   - anything that is NOT an /api route falls back to the SPA index.html
 *   - /ws is a WebSocket upgrade (never an Express GET) so it is unaffected
 *
 * Returns true when the SPA was mounted (WEB_DIST present and exists), false
 * otherwise — so the composition root can log accordingly.
 */
export function mountSpaStatic(
  app: Express,
  webDist: string | undefined = process.env.WEB_DIST,
): boolean {
  if (!webDist || !fs.existsSync(webDist)) return false;
  const indexHtml = path.join(webDist, "index.html");
  app.use(express.static(webDist));
  // Anything that is not an /api route falls back to the SPA entry. (/ws is a
  // WebSocket upgrade handled elsewhere, never an Express GET, so unaffected.)
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => res.sendFile(indexHtml));
  return true;
}
