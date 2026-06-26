// bridge/ipc — the main-process IPC surface the web SPA calls through the
// preload-exposed `window.desktop`. Each handler is the desktop capability the
// renderer is allowed to invoke; nothing else crosses the boundary.
const { ipcMain } = require("electron");
const settings = require("./settings");

/**
 * Register the desktop IPC handlers.
 * @param requestQuit () => void — the single "really quit" entry point (used by
 *                    the in-app 離開 button).
 */
function registerIpc(requestQuit) {
  // Current desktop settings (toggle position, etc.).
  ipcMain.handle("desktop:getSettings", () => settings.get());

  // Toggle 最小化到系統匣; persists and returns the new settings. The tray
  // close/minimize handlers read settings.get() live, so this takes effect at
  // the next gesture without re-wiring anything.
  ipcMain.handle("desktop:setMinimizeToTray", (_event, value) =>
    settings.set({ minimizeToTray: !!value }),
  );

  // In-app "離開應用程式" — a true quit (mirrors the tray menu's 離開).
  ipcMain.handle("desktop:quit", () => {
    requestQuit();
  });
}

module.exports = { registerIpc };
