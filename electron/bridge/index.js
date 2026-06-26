// bridge/ — the web↔desktop capability layer. All renderer-facing desktop
// features (tray, settings, quit, and future ones like notifications) live here
// so electron/main.js stays a thin lifecycle host. main.js calls registerBridge
// once with the created window; everything else is internal to this layer.
//
// Quit model: close (X) and minimize (−) are intercepted to hide-to-tray while
// the `minimizeToTray` setting is on. A single `quitting` flag, flipped only by
// requestQuit() (tray「離開」/ in-app 離開 button / before-quit), lets the close
// handler know a real teardown is underway so it stops intercepting.
const { setupTray } = require("./tray");
const { registerIpc } = require("./ipc");

/**
 * Wire the desktop bridge onto a window.
 * @param win the BrowserWindow
 * @param app the Electron app (for quit + before-quit)
 * @returns {{ requestQuit: () => void }}
 */
function registerBridge(win, app) {
  let quitting = false;
  const getQuitting = () => quitting;
  const requestQuit = () => {
    quitting = true;
    app.quit();
  };

  // Any quit path (menu Cmd+Q, OS shutdown, auto-update restart) must bypass the
  // hide-on-close interception so the app can actually exit.
  app.on("before-quit", () => {
    quitting = true;
  });

  setupTray(win, getQuitting, requestQuit);
  registerIpc(requestQuit);

  return { requestQuit };
}

module.exports = { registerBridge };
