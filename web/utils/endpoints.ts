/**
 * Endpoint resolution (PQ-8). Derives the WebSocket and API-base URLs from the
 * runtime config, upgrading ws→wss (and http→https) to match the page protocol
 * when served over TLS, and resolving relative URLs against `window.location`.
 *
 * Pure on the server side (returns the configured value unchanged — SSR has no
 * `window`). On the client it reconciles protocol + host so a config that points
 * at `ws://host:4000/ws` is not blocked as mixed-content on an https page, and a
 * relative `/ws` resolves to the current origin with the correct ws/wss scheme.
 */

/** Shape we need from `useRuntimeConfig().public` — kept structural for testability. */
export interface EndpointConfig {
  apiBase: string;
  wsUrl: string;
}

/** True when running in a browser with a usable `window.location`. */
function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.location !== "undefined";
}

/** Whether the current page is served over a TLS scheme (https / wss). */
function pageIsSecure(): boolean {
  if (!hasWindow()) return false;
  return window.location.protocol === "https:";
}

/**
 * Resolve the WebSocket URL for the live feed.
 *
 * - On the server (no window): returns `cfg.wsUrl` unchanged.
 * - Relative (`/ws`, `//host/ws`) or scheme-less values resolve against the page
 *   origin, choosing `wss:` on an https page and `ws:` otherwise.
 * - Absolute `ws://` / `wss://` values keep their host/path but are upgraded to
 *   `wss:` when the page is https (avoids mixed-content blocking).
 */
export function resolveWsUrl(cfg: EndpointConfig): string {
  const raw = cfg.wsUrl;
  if (!hasWindow()) return raw;

  const secure = pageIsSecure();
  const wsScheme = secure ? "wss:" : "ws:";

  // Absolute ws/wss URL — keep host & path, only force scheme up to wss on https.
  if (/^wss?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (secure && u.protocol === "ws:") u.protocol = "wss:";
      return u.toString();
    } catch {
      return raw;
    }
  }

  // Anything else (relative path, scheme-less host) → resolve against page origin.
  try {
    const base = `${wsScheme}//${window.location.host}`;
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    return new URL(path, base).toString();
  } catch {
    return raw;
  }
}

/**
 * Resolve the REST API base URL.
 *
 * - On the server (no window): returns `cfg.apiBase` unchanged.
 * - Relative values resolve against the page origin.
 * - Absolute `http://` values are upgraded to `https://` when the page is https.
 */
export function resolveApiBase(cfg: EndpointConfig): string {
  const raw = cfg.apiBase;
  if (!hasWindow()) return raw;

  const secure = pageIsSecure();

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (secure && u.protocol === "http:") u.protocol = "https:";
      // strip a trailing slash for consistent `${base}/api/...` concatenation
      return u.toString().replace(/\/$/, "");
    } catch {
      return raw;
    }
  }

  try {
    return new URL(raw, window.location.origin).toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}
