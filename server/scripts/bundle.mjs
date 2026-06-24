// Bundle the backend into a single CommonJS file for desktop packaging.
//
// esbuild inlines express/cors/ws so the packaged app ships ONE file
// (server/bundle/index.cjs) with no node_modules. CJS output keeps `require`
// native and is unambiguous to Electron's utilityProcess (a bare `.js` next to
// no package.json would otherwise be misread as ESM/CJS depending on context).
// The entry's `import.meta.url` is shimmed by esbuild under the cjs target.
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
