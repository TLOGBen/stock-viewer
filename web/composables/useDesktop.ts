/**
 * useDesktop — the web side of the electron `bridge` layer. Wraps the
 * preload-exposed `window.desktop` facade with feature detection so the app
 * degrades gracefully in a plain browser (npm run dev at :3000, where
 * `window.desktop` is undefined): `isDesktop` is false and every call is a
 * no-op returning null. SSR-safe (window is undefined on the server).
 *
 * Mirrors the desktop IPC surface in electron/bridge/preload.js + ipc.js.
 */

/** Desktop-shell settings (shape mirrors electron/bridge/settings.js DEFAULTS). */
export interface DesktopSettings {
  minimizeToTray: boolean;
}

interface DesktopApi {
  getSettings(): Promise<DesktopSettings>;
  setMinimizeToTray(value: boolean): Promise<DesktopSettings>;
  quit(): Promise<void>;
}

/** The injected bridge facade, or null in a non-Electron environment. */
function bridge(): DesktopApi | null {
  if (typeof window === "undefined") return null;
  const d = (window as unknown as { desktop?: DesktopApi }).desktop;
  return d ?? null;
}

/** True when running inside the Electron desktop shell. */
export function isDesktopEnv(): boolean {
  return bridge() != null;
}

export function useDesktop(): {
  isDesktop: boolean;
  getSettings: () => Promise<DesktopSettings | null>;
  setMinimizeToTray: (value: boolean) => Promise<DesktopSettings | null>;
  quit: () => void;
} {
  async function getSettings(): Promise<DesktopSettings | null> {
    const d = bridge();
    if (d == null) return null;
    try {
      return await d.getSettings();
    } catch (err) {
      console.error("useDesktop: getSettings failed", err);
      return null;
    }
  }

  async function setMinimizeToTray(value: boolean): Promise<DesktopSettings | null> {
    const d = bridge();
    if (d == null) return null;
    try {
      return await d.setMinimizeToTray(value);
    } catch (err) {
      console.error("useDesktop: setMinimizeToTray failed", err);
      return null;
    }
  }

  function quit(): void {
    const d = bridge();
    if (d == null) return;
    try {
      void d.quit();
    } catch (err) {
      console.error("useDesktop: quit failed", err);
    }
  }

  return { isDesktop: isDesktopEnv(), getSettings, setMinimizeToTray, quit };
}
