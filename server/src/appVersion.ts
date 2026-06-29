/**
 * Resolve the app version surfaced by /api/health. Pure + injectable so it is
 * unit-testable: the composition root passes the bundle-time injected constant
 * (`__APP_VERSION__`, defined by server/scripts/bundle.mjs from the ROOT
 * package.json) and a reader for the dev fallback (the root package.json).
 *
 * Why this exists: the packaged bundle ships only server/bundle/, so a runtime
 * `require("../package.json")` finds nothing and falls back to "0.0.0"; and the
 * server's own package.json is a never-bumped 1.0.0. Build-time injection makes
 * the health page report the real desktop release version instead.
 */
export function resolveAppVersion(
  injected: string | undefined,
  readRootVersion: () => string | undefined,
): string {
  if (typeof injected === "string" && injected !== "") return injected;
  try {
    const version = readRootVersion();
    return typeof version === "string" && version !== "" ? version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
