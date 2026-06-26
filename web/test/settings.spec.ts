// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import Settings from "../pages/settings.vue";

/**
 * The 設定 page is desktop-only: in a browser the tray toggle is disabled with a
 * 「桌面版專屬」note and the quit section is hidden; inside the shell it hydrates
 * from window.desktop.getSettings() and persists via setMinimizeToTray.
 */
afterEach(() => {
  delete (window as { desktop?: unknown }).desktop;
  vi.restoreAllMocks();
});

describe("settings page — browser mode", () => {
  it("disables the tray toggle, shows the desktop-only note, hides quit", async () => {
    const wrapper = mount(Settings);
    await flushPromises();
    expect(wrapper.find(".switch").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("桌面版專屬");
    expect(wrapper.find(".quit-btn").exists()).toBe(false);
  });
});

describe("settings page — desktop mode", () => {
  it("reflects the persisted toggle, persists a flip, and shows quit", async () => {
    const setMinimizeToTray = vi
      .fn()
      .mockResolvedValue({ minimizeToTray: false });
    (window as { desktop?: unknown }).desktop = {
      getSettings: vi.fn().mockResolvedValue({ minimizeToTray: true }),
      setMinimizeToTray,
      quit: vi.fn(),
    };

    const wrapper = mount(Settings);
    await flushPromises();

    // hydrated to ON from getSettings
    expect(wrapper.find(".switch").classes()).toContain("on");
    expect(wrapper.find(".switch").attributes("disabled")).toBeUndefined();
    expect(wrapper.find(".quit-btn").exists()).toBe(true);

    // flipping the toggle persists the new value through the bridge
    await wrapper.find(".switch").trigger("click");
    expect(setMinimizeToTray).toHaveBeenCalledWith(false);
  });
});
