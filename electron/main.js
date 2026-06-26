// Electron main process for the Taiwan Trading Desk desktop app.
//
// Responsibilities:
//  1. Launch the bundled Node backend (server/dist/index.js) in a child Node
//     process via Electron's utilityProcess — no separate Node install needed.
//  2. Point the backend at a *writable* per-user data dir and at the bundled
//     SPA (WEB_DIST), so one local origin (http://127.0.0.1:PORT) serves the
//     whole app.
//  3. Wait for the port to accept connections, then open the window on it.
//  4. Tear the backend down cleanly on quit.
const { app, BrowserWindow, shell, utilityProcess, dialog } = require("electron");
const path = require("node:path");
const net = require("node:net");
const { registerBridge } = require("./bridge");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 4000;
const APP_URL = `http://${HOST}:${PORT}`;

const isPackaged = app.isPackaged;

// In a packaged build the backend + SPA live under resources/. In dev we run
// straight from the repo (server already built into server/dist).
const resBase = isPackaged
  ? process.resourcesPath
  : path.join(__dirname, "..");
const serverEntry = path.join(resBase, "server", "bundle", "index.cjs");
const webDist = isPackaged
  ? path.join(process.resourcesPath, "web", "public")
  : path.join(resBase, "web", ".output", "public");

let backend = null;
let win = null;

/** Resolve once the backend port accepts a TCP connection (or time out). */
function waitForPort(port, host, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect(port, host);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`backend did not open ${host}:${port} in time`));
        } else {
          setTimeout(tryOnce, 250);
        }
      });
    };
    tryOnce();
  });
}

function startBackend() {
  // Persist universe/watchlist/k-line caches in the OS per-user data dir so the
  // (read-only) install location is never written to.
  const dataDir = path.join(app.getPath("userData"), "data");
  backend = utilityProcess.fork(serverEntry, [], {
    serviceName: "twse-desk-backend",
    env: {
      ...process.env,
      HOST,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      WEB_DIST: webDist,
    },
    stdio: "inherit",
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0b0e14",
    title: "即時交易台",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "bridge", "preload.js"),
    },
  });

  // Open external links (if any) in the system browser, not a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Wire the web↔desktop bridge (tray, settings, quit) onto this window before
  // it loads, so close/minimize interception is active from first paint.
  registerBridge(win, app);

  try {
    await waitForPort(PORT, HOST);
    await win.loadURL(APP_URL);
  } catch (err) {
    await win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font-family:sans-serif;background:#0b0e14;color:#e6e6e6;padding:2rem">
             <h2>啟動失敗</h2><p>無法啟動後端服務。請關閉重開，或回報以下訊息：</p>
             <pre>${String(err)}</pre></body>`,
        ),
    );
  }
  win.show();
}

/**
 * Check GitHub Releases for a newer version, download it in the background, and
 * offer to restart-and-install once ready. Only runs in a packaged build with a
 * real version (dev builds report 1.0.0 and have no update feed). Failures
 * (offline, no releases yet) are swallowed — the app must still open normally.
 */
async function setupAutoUpdates() {
  if (!isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return; // electron-updater not bundled — skip silently.
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", async (info) => {
    // Guard the dialog: if the window is already gone (app quitting while a
    // download finishes), showMessageBox rejects — swallow it like the other
    // updater paths rather than surfacing an unhandledRejection.
    try {
      const { response } = await dialog.showMessageBox({
        type: "info",
        buttons: ["立即重啟更新", "稍後"],
        defaultId: 0,
        cancelId: 1,
        title: "有新版本",
        message: `已下載新版本 ${info.version}。`,
        detail: "要現在重新啟動以完成更新嗎？（也可以下次開啟時自動套用）",
      });
      if (response === 0) autoUpdater.quitAndInstall();
    } catch {
      /* window gone / app quitting — update applies on next launch anyway */
    }
  });

  autoUpdater.on("error", () => {
    /* offline / no release feed — ignore, app keeps running */
  });

  try {
    await autoUpdater.checkForUpdates();
  } catch {
    /* ignore — never block startup on update check */
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  setupAutoUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Make sure the backend child is not orphaned when the app exits.
//
// NOTE on shutdown semantics: utilityProcess.kill() sends SIGTERM, but on
// Windows there are no POSIX signals — the child is terminated hard, so the
// backend's own SIGINT/SIGTERM graceful-shutdown handler (server/src/index.ts)
// only runs on POSIX/dev. That is fine here: the backend has nothing buffered
// to flush (universe/watchlist caches are written eagerly), and the child is
// lifecycle-bound to this process. Do not mistake that handler for the
// authoritative desktop shutdown path.
app.on("before-quit", () => {
  if (backend) {
    try {
      backend.kill();
    } catch {
      /* already gone */
    }
    backend = null;
  }
});
