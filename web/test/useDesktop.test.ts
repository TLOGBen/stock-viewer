import { describe, it, expect, vi, afterEach } from "vitest";
import { useDesktop, isDesktopEnv } from "../composables/useDesktop";

/**
 * useDesktop wraps the electron bridge's `window.desktop`. In a plain browser
 * the facade is absent → isDesktop false and every call is a safe no-op; inside
 * the desktop shell it delegates to the injected facade.
 */
function setWindow(desktop: unknown | undefined): void {
  (globalThis as { window?: unknown }).window =
    desktop === undefined ? {} : { desktop };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe("useDesktop — browser (no bridge)", () => {
  it("isDesktop false and calls are safe no-ops", async () => {
    setWindow(undefined); // window present, but no .desktop
    const d = useDesktop();
    expect(d.isDesktop).toBe(false);
    expect(await d.getSettings()).toBeNull();
    expect(await d.setMinimizeToTray(true)).toBeNull();
    expect(() => d.quit()).not.toThrow();
  });

  it("isDesktopEnv is false when window is undefined (SSR)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(isDesktopEnv()).toBe(false);
  });
});

describe("useDesktop — desktop (bridge present)", () => {
  it("delegates getSettings/setMinimizeToTray/quit to window.desktop", async () => {
    const fake = {
      getSettings: vi.fn().mockResolvedValue({ minimizeToTray: true }),
      setMinimizeToTray: vi.fn().mockResolvedValue({ minimizeToTray: false }),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    setWindow(fake);
    const d = useDesktop();
    expect(d.isDesktop).toBe(true);
    expect(await d.getSettings()).toEqual({ minimizeToTray: true });
    expect(await d.setMinimizeToTray(false)).toEqual({ minimizeToTray: false });
    expect(fake.setMinimizeToTray).toHaveBeenCalledWith(false);
    d.quit();
    expect(fake.quit).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejecting bridge call → null (never throws to the UI)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    setWindow({
      getSettings: vi.fn().mockRejectedValue(new Error("ipc down")),
      setMinimizeToTray: vi.fn(),
      quit: vi.fn(),
    });
    const d = useDesktop();
    expect(await d.getSettings()).toBeNull();
  });
});
