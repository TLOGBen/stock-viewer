<script setup lang="ts">
// 市場 — market overview. The 類股熱力圖 self-sources its data; this page adds a
// dense 市場焦點 (market focus) strip above it — Top gainers/losers + breadth —
// derived read-only from the live quotes singleton so the page reads as a
// terminal even with only a handful of symbols.
import { computed } from "vue";
import type { Quote } from "~/types";
import { formatPrice, formatPercent, signClass } from "~/utils/format";

const { quotes } = useMarketData();

interface FocusRow {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number;
}

/** Quotes with a finite changePercent, mapped to the lean FocusRow shape. */
const rows = computed<FocusRow[]>(() => {
  const out: FocusRow[] = [];
  for (const q of Object.values(quotes.value) as Quote[]) {
    if (!Number.isFinite(q.changePercent)) continue;
    out.push({
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      changePercent: q.changePercent,
    });
  }
  return out;
});

const TOP_N = 5;

/** Top movers up — highest changePercent first, only genuine gainers. */
const gainers = computed<FocusRow[]>(() =>
  [...rows.value]
    .filter((r) => r.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, TOP_N),
);

/** Top movers down — lowest changePercent first, only genuine losers. */
const losers = computed<FocusRow[]>(() =>
  [...rows.value]
    .filter((r) => r.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, TOP_N),
);

/** 漲跌平家數 breadth across all quoted symbols. */
const breadth = computed<{ up: number; down: number; flat: number }>(() => {
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const r of rows.value) {
    if (r.changePercent > 0) up += 1;
    else if (r.changePercent < 0) down += 1;
    else flat += 1;
  }
  return { up, down, flat };
});

const hasData = computed<boolean>(() => rows.value.length > 0);
</script>

<template>
  <div class="market-page">
    <section class="panel focus">
      <div class="panel-head">
        <span class="panel-title">市場焦點</span>
        <span class="focus-breadth mono" aria-label="漲跌平家數">
          <span class="c-up">漲 {{ breadth.up }}</span>
          <span class="focus-sep" aria-hidden="true">·</span>
          <span class="c-down">跌 {{ breadth.down }}</span>
          <span class="focus-sep" aria-hidden="true">·</span>
          <span class="dim">平 {{ breadth.flat }}</span>
        </span>
      </div>

      <div class="panel-body focus-body">
        <p v-if="!hasData" class="empty">尚無行情</p>

        <div v-else class="focus-cols">
          <div class="focus-col">
            <div class="focus-col-head">
              <span class="label">漲幅排行</span>
            </div>
            <table v-if="gainers.length" class="tbl focus-tbl">
              <tbody>
                <tr v-for="r in gainers" :key="`up-${r.symbol}`">
                  <td class="focus-sym">{{ r.symbol }}</td>
                  <td class="focus-name">{{ r.name }}</td>
                  <td class="mono">{{ formatPrice(r.price) }}</td>
                  <td class="mono" :class="signClass('up')">
                    {{ formatPercent(r.changePercent) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="empty focus-empty">無上漲標的</p>
          </div>

          <div class="focus-col">
            <div class="focus-col-head">
              <span class="label">跌幅排行</span>
            </div>
            <table v-if="losers.length" class="tbl focus-tbl">
              <tbody>
                <tr v-for="r in losers" :key="`down-${r.symbol}`">
                  <td class="focus-sym">{{ r.symbol }}</td>
                  <td class="focus-name">{{ r.name }}</td>
                  <td class="mono">{{ formatPrice(r.price) }}</td>
                  <td class="mono" :class="signClass('down')">
                    {{ formatPercent(r.changePercent) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="empty focus-empty">無下跌標的</p>
          </div>
        </div>
      </div>
    </section>

    <Heatmap />
  </div>
</template>

<style scoped>
.market-page {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  min-width: 0;
}

.focus {
  min-width: 0;
}

/* breadth readout in the panel head, right-aligned terminal counts */
.focus-breadth {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.focus-sep {
  color: var(--text-dim);
}

.focus-body {
  padding: 0;
}

/* two dense ranking columns split by a single hairline */
.focus-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.focus-col {
  min-width: 0;
}

.focus-col + .focus-col {
  border-left: 1px solid var(--hairline);
}

.focus-col-head {
  padding: 7px 10px;
  border-bottom: 1px solid var(--hairline);
  background: var(--surface-2);
}

.focus-tbl {
  table-layout: fixed;
}

/* symbol column reads as the row label (left-aligned via table.tbl rule) */
.focus-sym {
  font-weight: 600;
  color: var(--text);
}

.focus-name {
  text-align: left;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.focus-empty {
  padding: 16px;
  font-size: 12px;
}
</style>
