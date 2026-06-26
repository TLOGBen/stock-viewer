// bridge/tray — system-tray icon + minimize-to-tray window behavior.
//
// When the `minimizeToTray` setting is on, both the close (X) and minimize (−)
// gestures hide the window to the tray instead of quitting/minimizing; the app
// keeps running. Two escape hatches truly quit: the tray menu「離開」and the
// in-app quit button — both route through requestQuit(), which sets the
// is-quitting flag so the close handler stops intercepting.
const { Tray, Menu } = require("electron");
const path = require("node:path");
const settings = require("./settings");

let tray = null;

/**
 * Wire the tray and the close/minimize interception onto `win`.
 * @param win          the BrowserWindow
 * @param getQuitting  () => boolean — true once a real quit is in progress
 * @param requestQuit  () => void   — the single "really quit" entry point
 */
function setupTray(win, getQuitting, requestQuit) {
  // Idempotent across window re-creation (e.g. macOS dock re-activate): drop a
  // prior tray so we never stack duplicate icons.
  if (tray) {
    tray.destroy();
    tray = null;
  }
  // icon.png is shipped under electron/build/ (reused from packaging assets).
  const iconPath = path.join(__dirname, "..", "build", "icon.png");
  try {
    tray = new Tray(iconPath);
  } catch (err) {
    // A missing/invalid icon must not break startup — the window still works,
    // just without a tray. Behavior interception below is skipped too.
    console.error("[bridge/tray] could not create tray:", err);
    return null;
  }

  tray.setToolTip("即時交易台");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "顯示", click: () => revealWindow(win) },
      { type: "separator" },
      { label: "離開", click: () => requestQuit() },
    ]),
  );
  // Single-click the tray icon toggles visibility (common Windows affordance).
  tray.on("click", () => {
    if (win.isVisible()) win.focus();
    else revealWindow(win);
  });

  // Close (X): hide to tray unless a real quit is underway.
  win.on("close", (e) => {
    if (settings.get().minimizeToTray && !getQuitting()) {
      e.preventDefault();
      win.hide();
    }
  });
  // Minimize (−): hide to tray instead of going to the taskbar.
  win.on("minimize", (e) => {
    if (settings.get().minimizeToTray) {
      e.preventDefault();
      win.hide();
    }
  });

  return tray;
}

/** Restore + focus a hidden/minimized window. */
function revealWindow(win) {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

module.exports = { setupTray };
