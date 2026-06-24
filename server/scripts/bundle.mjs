// Bundle the backend into a single CommonJS file for desktop packaging.
//
// esbuild inlines express/cors/ws so the packaged app ships ONE file
// (server/bundle/index.cjs) with no node_modules. CJS output keeps `require`
// native and is unambiguous to Electron's utilityProcess (a bare `.js` next to
// no package.json would otherwise be misread as ESM/CJS depending on context).
//
// `import.meta.url` is undefined under cjs output; the banner + define below
// replace it with a real file URL from __filename, so config.ts (resolveDataDir)
// and index.ts (APP_VERSION) resolve correctly even without the DATA_DIR env.
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
  // `import.meta.url` is undefined under cjs output; replace it with a real file
  // URL from __filename so config.ts (resolveDataDir) and index.ts (APP_VERSION
  // reads ../package.json) resolve correctly when run as the bundled file.
  banner: {
    js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  define: { "import.meta.url": "__importMetaUrl" },
  logLevel: "info",
});
