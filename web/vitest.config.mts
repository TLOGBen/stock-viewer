import { defineConfig, type Plugin } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

// vitest bundles its own (older) vite, so plugin-vue's Plugin type — built against
// the root vite — is structurally incompatible at the type level only. The runtime
// plugin is identical; cast through the vitest-vite Plugin shape to keep typecheck
// clean without a version-pinning dance.
const vuePlugin = vue() as unknown as Plugin;

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Pure-logic unit tests (formatters, position math) run in a plain Node environment.
// They import explicitly from project utils/types and do not rely on Nuxt auto-imports.
// The `~`/`@` aliases mirror Nuxt so value imports from "~/types" resolve.
//
// Component tests (`test/**/*.spec.ts`) mount real .vue SFCs with @vue/test-utils;
// each opts into the DOM with a `// @vitest-environment happy-dom` file pragma, so
// the node default stays cheap for the pure-logic suite. The Vue plugin compiles
// the SFCs the same way Nuxt's vite build does.
export default defineConfig({
  plugins: [vuePlugin],
  resolve: {
    alias: {
      "~": r("./"),
      "@": r("./"),
      "~~": r("./"),
      "@@": r("./"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.spec.ts"],
    globals: true,
  },
});
