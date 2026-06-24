// Bundle the backend into a single CommonJS file for desktop packaging.
//
// esbuild inlines express/cors/ws so the packaged app ships ONE file
// (server/bundle/index.cjs) with no node_modules. CJS output keeps `require`
// native and is unambiguous to Electron's utilityProcess (a bare `.js` next to
// no package.json would otherwise be misread as ESM/CJS depending on context).
//
// CAVEAT: `import.meta.url` is NOT available under the cjs output format —
// esbuild compiles it to an empty object, so config.ts's `new URL("../data/",
// import.meta.url)` fallback would throw "Invalid URL". That branch is never
// reached in the desktop app because main.js always passes DATA_DIR, which
// config.ts honors before touching import.meta.url. If you ever run this bundle
// WITHOUT DATA_DIR set, add `define: { "import.meta.url": ... }` here first.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

await build({
  entryPoints: [resolve(root, "src/index.ts")],
  outfile: resolve(root, "bundle/index.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  logLevel: "info",
});
