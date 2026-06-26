// bridge/preload — the ONLY script with both Node and renderer reach. Runs with
// contextIsolation, so it exposes a frozen, minimal `window.desktop` facade over
// ipcRenderer.invoke — the renderer never sees ipcRenderer or Node directly.
//
// In a plain browser (npm run dev at :3000, or any non-Electron load) this file
// never runs, so `window.desktop` is undefined — the web side must feature-detect
// (see useDesktop) and degrade gracefully.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  /** @returns {Promise<{minimizeToTray: boolean}>} current desktop settings */
  getSettings: () => ipcRenderer.invoke("desktop:getSettings"),
  /** Persist the 最小化到系統匣 toggle. @returns {Promise<object>} new settings */
  setMinimizeToTray: (value) =>
    ipcRenderer.invoke("desktop:setMinimizeToTray", value),
  /** Really quit the app (mirrors the tray 離開 menu). */
  quit: () => ipcRenderer.invoke("desktop:quit"),
});
