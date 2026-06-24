<script setup lang="ts">
/**
 * /health — system health dashboard. Polls `GET /api/health` every 5s and
 * renders the rolled-up traffic light plus feed / official-cache / universe /
 * market cards in the existing terminal design language. Polling is client-only
 * (started in onMounted, cleared on unmount); a manual 重新整理 button forces an
 * immediate refresh. fetchHealth never throws — a null result renders a
 * disconnected state rather than blanking the page.
 */
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import type { HealthReport } from "~/types";
import { formatTime } from "~/utils/format";

const { fetchHealth } = useApi();

const POLL_MS = 5000;

const report = ref<HealthReport | null>(null);
const loading = ref<boolean>(true);
const reachable = ref<boolean>(true);
const lastFetchedAt = ref<number | null>(null);

let timer: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void> {
  loading.value = true;
  const res = await fetchHealth();
  if (res) {
    report.value = res;
    reachable.value = true;
  } else {
    reachable.value = false;
  }
  lastFetchedAt.value = Date.now();
  loading.value = false;
}

onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), POLL_MS);
});

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});

// ── derived display state ──

/** Effective status: backend roll-up when reachable, else a synthetic "down". */
const status = computed<HealthReport["status"]>(() =>
  reachable.value && report.value ? report.value.status : "down",
);

const statusLabel = computed<string>(() => {
  if (!reachable.value) return "無法連線";
  switch (status.value) {
    case "ok":
      return "正常";
    case "degraded":
      return "降級";
    case "down":
      return "中斷";
    default:
      return "—";
  }
});

/** Format a duration in ms as a compact human string; "—" when null. */
function formatAge(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分${s % 60}秒`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時${m % 60}分`;
  const d = Math.floor(h / 24);
  return `${d}天${h % 24}時`;
}

function formatBool(b: boolean | undefined): string {
  return b ? "是" : "否";
}

const feed = computed(() => report.value?.feed ?? null);
const universe = computed(() => report.value?.universe ?? null);
const market = computed(() => report.value?.market ?? null);

const feedStats = computed<{ label: string; value: string; cls?: string }[]>(
  () => {
    const f = feed.value;
    if (!f) return [];
    return [
      {
        label: "連續失敗",
        value: String(f.consecutiveFailures),
        cls: f.consecutiveFailures > 0 ? "v-warn" : undefined,
      },
      { label: "最後 TICK 年齡", value: formatAge(f.lastTickAgeMs) },
      {
        label: "備援啟用",
        value: formatBool(f.fallbackActive),
        cls: f.fallbackActive ? "v-warn" : undefined,
      },
      { label: "追蹤標的", value: String(f.activeSymbols) },
      { label: "快照數", value: String(f.snapshotCount) },
      {
        label: "最後錯誤",
        value: f.lastError ?? "—",
        cls: f.lastError ? "v-bad" : undefined,
      },
    ];
  },
);

const cacheStats = computed<{ label: string; value: string }[]>(() => {
  const f = feed.value;
  if (!f) return [];
  return [
    { label: "快取筆數", value: String(f.officialCache.size) },
    { label: "快取年齡", value: formatAge(f.officialCache.ageMs) },
  ];
});

const universeStats = computed<
  { label: string; value: string; cls?: string }[]
>(() => {
  const u = universe.value;
  if (!u) return [];
  return [
    { label: "標的數", value: String(u.count) },
    {
      label: "陳舊",
      value: formatBool(u.stale),
      cls: u.stale ? "v-warn" : undefined,
    },
    {
      label: "更新於",
      value: u.asOf > 0 ? formatTime(u.asOf) : "—",
    },
  ];
});

const metaStats = computed<{ label: string; value: string }[]>(() => {
  const r = report.value;
  if (!r) return [];
  return [
    { label: "版本", value: r.version || "—" },
    { label: "運行時間", value: formatAge(r.uptimeMs) },
    {
      label: "市場",
      value: market.value?.label ?? "—",
    },
    {
      label: "伺服器時間",
      value: r.serverTime > 0 ? formatTime(r.serverTime) : "—",
    },
  ];
});

const lastFetchedText = computed<string>(() =>
  lastFetchedAt.value ? formatTime(lastFetchedAt.value) : "—",
);
</script>

<template>
  <div class="health-page">
    <section class="panel">
      <header class="panel-head">
        <span class="panel-title">系統健康</span>
        <div class="health-head-right">
          <span class="health-fetched mono dim">更新於 {{ lastFetchedText }}</span>
          <button
            type="button"
            class="btn health-refresh"
            :disabled="loading"
            @click="refresh"
          >
            {{ loading ? "更新中…" : "重新整理" }}
          </button>
        </div>
      </header>

      <div class="panel-body health-body">
        <!-- traffic light -->
        <div class="health-status" :class="`status-${status}`">
          <span class="status-dot" aria-hidden="true" />
          <span class="status-label">{{ statusLabel }}</span>
          <span class="status-code mono dim">{{ status }}</span>
        </div>

        <!-- cards grid -->
        <div class="health-cards">
          <section class="hcard">
            <h3 class="hcard-title">即時行情 FEED</h3>
            <div v-if="feedStats.length" class="statgrid hcard-grid">
              <div v-for="s in feedStats" :key="s.label" class="stat">
                <span class="stat-k">{{ s.label }}</span>
                <span class="stat-v" :class="s.cls">{{ s.value }}</span>
              </div>
            </div>
            <p v-else class="empty">無資料</p>
          </section>

          <section class="hcard">
            <h3 class="hcard-title">官方收盤快取</h3>
            <div v-if="cacheStats.length" class="statgrid hcard-grid">
              <div v-for="s in cacheStats" :key="s.label" class="stat">
                <span class="stat-k">{{ s.label }}</span>
                <span class="stat-v">{{ s.value }}</span>
              </div>
            </div>
            <p v-else class="empty">無資料</p>
          </section>

          <section class="hcard">
            <h3 class="hcard-title">標的清單 UNIVERSE</h3>
            <div v-if="universeStats.length" class="statgrid hcard-grid">
              <div v-for="s in universeStats" :key="s.label" class="stat">
                <span class="stat-k">{{ s.label }}</span>
                <span class="stat-v" :class="s.cls">{{ s.value }}</span>
              </div>
            </div>
            <p v-else class="empty">無資料</p>
          </section>

          <section class="hcard">
            <h3 class="hcard-title">系統 SYSTEM</h3>
            <div v-if="metaStats.length" class="statgrid hcard-grid">
              <div v-for="s in metaStats" :key="s.label" class="stat">
                <span class="stat-k">{{ s.label }}</span>
                <span class="stat-v">{{ s.value }}</span>
              </div>
            </div>
            <p v-else class="empty">無資料</p>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.health-page {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  min-width: 0;
}

.health-head-right {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.health-fetched {
  font-size: 11px;
}

.health-refresh {
  padding: 5px 11px;
  font-size: 12px;
}

.health-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}

/* ── traffic light ── */
.health-status {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  align-self: flex-start;
  padding: 8px 14px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  background: var(--text-dim);
}

.status-label {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.status-code {
  font-size: 11px;
  text-transform: uppercase;
}

/* ok → cyan/ok ; degraded → amber/warn ; down → bad */
.status-ok {
  border-color: var(--ok);
}
.status-ok .status-dot {
  background: var(--ok);
  box-shadow: 0 0 8px var(--ok);
}
.status-ok .status-label {
  color: var(--ok);
}

.status-degraded {
  border-color: var(--warn);
}
.status-degraded .status-dot {
  background: var(--warn);
  box-shadow: 0 0 8px var(--warn);
}
.status-degraded .status-label {
  color: var(--warn);
}

.status-down {
  border-color: var(--bad);
}
.status-down .status-dot {
  background: var(--bad);
  box-shadow: 0 0 8px var(--bad);
}
.status-down .status-label {
  color: var(--bad);
}

/* ── cards ── */
.health-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gap);
  min-width: 0;
}

.hcard {
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  min-width: 0;
}

/* leading amber tick, same terminal treatment as .panel-title */
.hcard-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-2);
}
.hcard-title::before {
  content: "";
  width: 3px;
  height: 11px;
  background: var(--amber);
  border-radius: 1px;
  flex: none;
}

.hcard-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.hcard-grid .stat-v {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* semantic value tints (NOT the 紅漲綠跌 palette) */
.hcard-grid .stat-v.v-warn {
  color: var(--warn);
}
.hcard-grid .stat-v.v-bad {
  color: var(--bad);
}

@media (max-width: 720px) {
  .health-cards {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
