// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-06-01",
  devtools: { enabled: false },
  // SSR on for normal web serving; off when building the desktop (Electron)
  // bundle, where `nuxt generate` then emits a pure-static SPA served by the
  // Node backend from its own origin (WEB_DIST). Set ELECTRON_BUILD=1 to build it.
  ssr: process.env.ELECTRON_BUILD === "1" ? false : true,

  // Self-hosted webfonts FIRST (so tokens resolve to real families, not a
  // silent system-ui fallback): JetBrains Mono = numbers, Noto Sans TC = UI.
  // Then design tokens, then layout/components.
  css: [
    "@fontsource-variable/jetbrains-mono",
    "@fontsource/noto-sans-tc/400.css",
    "@fontsource/noto-sans-tc/500.css",
    "@fontsource/noto-sans-tc/700.css",
    "~/assets/css/theme.css",
    "~/assets/css/app.css",
  ],

  // Backend endpoints. These are dev defaults; NUXT_PUBLIC_API_BASE /
  // NUXT_PUBLIC_WS_URL env vars override them at runtime (Nuxt public runtime
  // config). On the client, resolveWsUrl/resolveApiBase (utils/endpoints.ts)
  // further upgrade http→https / ws→wss to match the page protocol (PQ-8).
  runtimeConfig: {
    public: {
      apiBase: "http://localhost:4000",
      wsUrl: "ws://localhost:4000/ws",
    },
  },

  app: {
    head: {
      title: "即時交易台 · Taiwan Trading Desk",
      htmlAttrs: { lang: "zh-Hant" },
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content: "即時台股交易台 — 8 檔標的即時行情、五檔報價與模擬下單。",
        },
      ],
    },
  },

  devServer: { port: 3000 },
});
