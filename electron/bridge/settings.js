// bridge/settings — persisted desktop settings (web↔electron bridge layer).
//
// Hand-rolled JSON in the per-user data dir with an atomic tmp+rename write,
// matching the backend persistence idiom (no electron-store dependency). The
// store is intentionally tiny — desktop-shell preferences only, never app data.
const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/** Desktop-shell preference defaults. Keep this the single source of shape. */
const DEFAULTS = Object.freeze({
  // 最小化到系統匣: when true, close (X) and minimize (−) hide to the tray
  // instead of quitting/taskbar; the app keeps running until an explicit quit.
  minimizeToTray: false,
});

/** Absolute path to the settings file (resolved lazily — app must be ready). */
function file() {
  return path.join(app.getPath("userData"), "settings.json");
}

let cache = null;

/** Load once from disk, merging over defaults; unreadable/malformed → defaults. */
function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8"));
    cache = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

/** Current settings (a copy — callers never mutate the cache). */
function get() {
  return { ...load() };
}

/** Merge a patch, persist atomically (tmp+rename), return the new settings. */
function set(patch) {
  cache = { ...load(), ...patch };
  try {
    const target = file();
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache), "utf8");
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error("[bridge/settings] write failed:", err);
  }
  return { ...cache };
}

module.exports = { get, set, DEFAULTS };
