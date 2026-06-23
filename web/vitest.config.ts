import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Pure-logic unit tests (formatters, position math) run in a plain Node environment.
// They import explicitly from project utils/types and do not rely on Nuxt auto-imports.
// The `~`/`@` aliases mirror Nuxt so value imports from "~/types" resolve.
export default defineConfig({
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
    include: ["test/**/*.test.ts"],
    globals: true,
  },
});
