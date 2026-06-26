<script setup lang="ts">
// 設定 — desktop-shell preferences. The only settings here are bridge-backed
// (electron/bridge), so the whole page is desktop-only: in a plain browser the
// controls are disabled with a 「桌面版專屬」note. State hydrates on mount from
// window.desktop.getSettings(); the toggle persists immediately via the bridge.
import { ref, onMounted } from "vue";
import { useDesktop } from "~/composables/useDesktop";

const desktop = useDesktop();

const isDesktop = ref(false);
const minimizeToTray = ref(false);
const loaded = ref(false);

onMounted(async () => {
  isDesktop.value = desktop.isDesktop;
  const s = await desktop.getSettings();
  if (s != null) minimizeToTray.value = s.minimizeToTray;
  loaded.value = true;
});

async function onToggleTray(): Promise<void> {
  const next = !minimizeToTray.value;
  minimizeToTray.value = next; // optimistic
  const s = await desktop.setMinimizeToTray(next);
  if (s != null) minimizeToTray.value = s.minimizeToTray; // reconcile
}

function onQuit(): void {
  // The in-app escape hatch: a true quit (mirrors the tray「離開」menu).
  const ok = window.confirm("確定要離開即時交易台？");
  if (ok) desktop.quit();
}
</script>

<template>
  <div class="settings-grid">
    <section class="panel">
      <header class="panel-head">
        <span class="panel-title">功能設定</span>
      </header>

      <div class="panel-body">
        <p v-if="!isDesktop && loaded" class="desktop-only-note dim">
          以下為桌面版專屬設定，在瀏覽器模式下無法調整。
        </p>

        <div class="setting-row" :class="{ disabled: !isDesktop }">
          <div class="setting-label">
            <span class="setting-name">最小化到系統匣</span>
            <span class="setting-desc dim">
              開啟後，關閉（X）與最小化（−）都會收進系統匣、不結束程式；
              從匣圖示右鍵選單或下方「離開應用程式」可真正關閉。
            </span>
          </div>
          <button
            type="button"
            role="switch"
            class="switch"
            :class="{ on: minimizeToTray }"
            :aria-checked="minimizeToTray"
            :disabled="!isDesktop"
            aria-label="最小化到系統匣"
            @click="onToggleTray"
          >
            <i aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>

    <section v-if="isDesktop" class="panel">
      <header class="panel-head">
        <span class="panel-title">應用程式</span>
      </header>
      <div class="panel-body">
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-name">離開應用程式</span>
            <span class="setting-desc dim">完全結束程式（含背景行情服務）。</span>
          </div>
          <button type="button" class="quit-btn" @click="onQuit">離開</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-grid {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  max-width: 720px;
}

.desktop-only-note {
  font-size: 12px;
  margin: 0 0 12px;
}

.setting-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 4px 0;
}

.setting-row.disabled {
  opacity: 0.55;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.setting-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.setting-desc {
  font-size: 11px;
  line-height: 1.45;
}

/* amber pill switch — single colour, not the red/green semantic palette */
.switch {
  flex: none;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: 1px solid var(--hairline);
  background: var(--flat-soft);
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease;
}

.switch > i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-2);
  transition: transform 0.15s ease, background 0.15s ease;
}

.switch.on {
  background: var(--amber);
}

.switch.on > i {
  transform: translateX(18px);
  background: #0b0e14;
}

.switch:disabled {
  cursor: not-allowed;
}

.switch:focus-visible {
  outline: 1px solid var(--amber);
  outline-offset: 2px;
}

.quit-btn {
  flex: none;
  appearance: none;
  background: none;
  border: 1px solid var(--down);
  color: var(--down);
  border-radius: 4px;
  padding: 6px 16px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.quit-btn:hover {
  background: var(--down);
  color: #0b0e14;
}

.quit-btn:focus-visible {
  outline: 1px solid var(--amber);
  outline-offset: 2px;
}
</style>
