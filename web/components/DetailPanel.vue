<script setup lang="ts">
import type {
  Quote,
  KlineInterval,
  KlineChartType,
  IndicatorSpec,
} from "~/types";

// 個股 (research) mode renders the embedded 五檔深度 + 量價分佈 block; 看盤
// (trading floor) keeps the panel compact (chart + stats only). Defaults to
// the compact view so the main page stays decluttered.
const props = withDefaults(defineProps<{ detailed?: boolean }>(), {
  detailed: false,
});

const md = useMarketData();
const q = md.selectedQuote;
const { freshnessOf } = useFreshness();

// 52週高/低 · 20日均量 · 振幅 (QM-2), re-fetched on symbol change.
const { stats: symbolStats } = useStats(md.selected);

// Desaturate the panel when the selected quote's feed is stale (PQ-2 / PQ-6).
const isStale = computed(
  () => freshnessOf(q.value, md.market.value) === "stale",
);

// 漲停 / 跌停 lock state for the selected quote (QM-6); null hides the badge.
const limitState = computed(() =>
  q.value ? limitStateOf(q.value) : null,
);

// ── chart UI state (local to the detail panel) ──
const interval = ref<KlineInterval>("D");
const chartType = ref<KlineChartType>("candle_solid");
const indicators = ref<IndicatorSpec[]>([
  { name: "MA", isOverlay: true, calcParams: [5, 10, 20] },
  { name: "VOL", isOverlay: false },
]);

const chartHost = ref<HTMLElement | null>(null);

/** Toggle the chart container into / out of native fullscreen. */
function toggleFullscreen(): void {
  if (!import.meta.client) return;
  const el = chartHost.value;
  if (!el) return;
  if (document.fullscreenElement) {
    void document.exitFullscreen?.();
  } else {
    void el.requestFullscreen?.();
  }
}

/** Format a possibly-null stat value as a price string, falling back to "—". */
function stat(n: number | null): string {
  return n == null ? "—" : formatPrice(n);
}

// 每格除了 label/value 外帶一個語意色 class：漲停固定紅、跌停固定綠、
// 振幅依正負上色，其餘留空 (純白 mono 值)。漲跌色為視覺鐵律不可對調。
const stats = computed<{ label: string; value: string; cls?: string }[]>(() => {
  const quote: Quote | null = q.value;
  if (!quote) return [];
  const ss = symbolStats.value;
  const amp = ss?.amplitude ?? null;
  const ampCls =
    amp == null ? undefined : amp > 0 ? "c-up" : amp < 0 ? "c-down" : "c-flat";
  return [
    { label: "開", value: stat(quote.open) },
    { label: "高", value: stat(quote.high) },
    { label: "低", value: stat(quote.low) },
    { label: "昨收", value: stat(quote.prevClose) },
    { label: "漲停", value: stat(quote.limitUp), cls: "c-up" },
    { label: "跌停", value: stat(quote.limitDown), cls: "c-down" },
    { label: "成交量", value: `${formatVolume(quote.volume)} 張` },
    { label: "當盤", value: `${formatInt(quote.lastVolume)} 張` },
    { label: "52週高", value: stat(ss?.week52High ?? null) },
    { label: "52週低", value: stat(ss?.week52Low ?? null) },
    {
      label: "20日均量",
      value:
        ss?.avgVolume20 == null
          ? "—"
          : `${formatVolume(ss.avgVolume20)} 張`,
    },
    {
      label: "振幅",
      value: amp == null ? "—" : formatPercent(amp),
      cls: ampCls,
    },
  ];
});
</script>

<template>
  <section class="panel detail-panel" :class="{ stale: isStale }">
    <header class="panel-head">
      <span class="panel-title">報價明細</span>
      <span v-if="q" class="detail-time mono dim">{{ q.time }}</span>
    </header>

    <div class="panel-body detail-body">
      <template v-if="q">
        <header class="detail-head">
          <span class="detail-symbol mono">{{ q.symbol }}</span>
          <span class="detail-name">{{ q.name }}</span>
          <span class="detail-fullname dim">{{ q.fullName }}</span>
        </header>

        <div class="detail-price-row" :class="signClass(q.direction)">
          <span class="detail-price mono">{{ formatPriceBanded(q.price) }}</span>
          <span
            class="detail-chip mono"
            :class="signClass(q.direction)"
          >
            <span class="detail-arrow" aria-hidden="true">{{ arrow(q.direction) }}</span>
            <span class="detail-change">{{ formatChange(q.change) }}</span>
            <span class="detail-pct">{{ formatPercent(q.changePercent) }}</span>
          </span>
          <LimitBadge :state="limitState" />
          <SourceBadge :source="q.source" />
        </div>

        <div class="detail-stats statgrid">
          <div v-for="s in stats" :key="s.label" class="stat">
            <span class="stat-k">{{ s.label }}</span>
            <span class="stat-v" :class="s.cls">{{ s.value }}</span>
          </div>
        </div>

        <div ref="chartHost" class="detail-chart">
          <KlineToolbar
            v-model:interval="interval"
            v-model:chart-type="chartType"
            @toggle-fullscreen="toggleFullscreen"
          />
          <KlineChart
            :symbol="md.selected.value"
            :interval="interval"
            :chart-type="chartType"
            :indicators="indicators"
          />
          <IndicatorPicker v-model:indicators="indicators" />
        </div>

        <div v-if="props.detailed" class="detail-viz">
          <div class="detail-viz-block">
            <h3 class="detail-viz-title">五檔深度</h3>
            <DepthChart :bids="q.bids" :asks="q.asks" />
          </div>
          <div class="detail-viz-block">
            <h3 class="detail-viz-title">量價分佈</h3>
            <VolumeProfile :symbol="md.selected.value" />
          </div>
        </div>
      </template>

      <p v-else class="empty detail-empty">尚無資料 / 載入中</p>
    </div>
  </section>
</template>

<style scoped>
/* .panel supplies the hairline frame + amber-tick title; .detail-panel only
   tunes stale state. 紅漲綠跌 colour rule is never overridden here. */
.detail-panel.stale {
  opacity: 0.62;
  filter: saturate(0.5);
}

/* the panel body stacks its sections at terminal density */
.detail-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}

/* 成交時間 — right-aligned mono, quiet (.mono .dim from shared utilities) */
.detail-time {
  font-size: 11px;
}

/* identity line: mono ticker + name + dim full name */
.detail-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 9px;
}

.detail-symbol {
  font-weight: 700;
  font-size: 16px;
  color: var(--text);
}

.detail-name {
  font-weight: 600;
  color: var(--text);
}

.detail-fullname {
  font-size: 12px;
}

/* hero price line — big mono figure + semantic change chip */
.detail-price-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--gap-sm);
}

.detail-price {
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}

/* 紅漲綠跌: signClass colours the big price figure */
.detail-price-row.c-up .detail-price {
  color: var(--up);
}
.detail-price-row.c-down .detail-price {
  color: var(--down);
}
.detail-price-row.c-flat .detail-price {
  color: var(--flat);
}

/* change / pct fused into one squared semantic chip (soft bg, sign colour) */
.detail-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--hairline);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.1;
}
.detail-chip.c-up {
  color: var(--up);
  background: var(--up-soft);
  border-color: var(--up-line);
}
.detail-chip.c-down {
  color: var(--down);
  background: var(--down-soft);
  border-color: var(--down-line);
}
.detail-chip.c-flat {
  color: var(--flat);
  background: var(--flat-soft);
  border-color: var(--hairline);
}

.detail-arrow {
  font-size: 12px;
}

/* dense stat block driven by shared .statgrid/.stat/.stat-k/.stat-v.
   Per-cell sign colour (漲停=紅 / 跌停=綠 / 振幅 by sign) rides on .stat-v. */
.detail-stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.detail-stats .stat-v {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Per-cell semantic colour must beat app.css `.stat-v { color: --text }`
   (equal specificity, later in cascade) — raise specificity here. 紅漲綠跌:
   漲停 fixed red, 跌停 fixed green, 振幅 by sign. */
.detail-stats .stat-v.c-up {
  color: var(--up);
}
.detail-stats .stat-v.c-down {
  color: var(--down);
}
.detail-stats .stat-v.c-flat {
  color: var(--flat);
}

.detail-chart {
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  min-width: 0;
}

/* fill the screen when the chart host enters native fullscreen */
.detail-chart:fullscreen {
  background: var(--bg);
  padding: 11px;
  gap: var(--gap-sm);
}

.detail-viz {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--gap);
  min-width: 0;
}

.detail-viz-block {
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  min-width: 0;
}

/* sub-section title: same terminal treatment as .panel-title (leading amber
   tick + mono uppercase tracking) so nested blocks stay consistent */
.detail-viz-title {
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
.detail-viz-title::before {
  content: "";
  width: 3px;
  height: 11px;
  background: var(--amber);
  border-radius: 1px;
  flex: none;
}

.detail-empty {
  margin: 0;
}

@media (max-width: 640px) {
  .detail-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .detail-viz {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
