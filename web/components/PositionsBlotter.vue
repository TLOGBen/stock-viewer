<script setup lang="ts">
import type { Position } from "~/types";

const md = useMarketData();
const pos = usePositions();

// Rows: positions with an open lot OR with booked realized P&L.
const rows = computed<Position[]>(() =>
  Object.values(pos.positions.value).filter(
    (p) => p.lots !== 0 || p.realized !== 0,
  ),
);

const isEmpty = computed<boolean>(() => rows.value.length === 0);

function currentPrice(symbol: string): number | null {
  return md.quotes.value[symbol]?.price ?? null;
}

function pnl(position: Position): number {
  return unrealizedPnl(position, currentPrice(position.symbol));
}

/** 紅漲綠跌: profit (>0) → red (c-up), loss (<0) → green (c-down). */
function pnlClass(n: number): string {
  return signClass(directionOf(n));
}

/** Signed lots string: long shows +, short shows -. */
function lotsLabel(lots: number): string {
  return `${lots > 0 ? "+" : ""}${lots}`;
}

function lotsClass(lots: number): string {
  return signClass(directionOf(lots));
}

const totalUnrealizedValue = computed<number>(() =>
  pos.totalUnrealized(md.quotes.value),
);

const totalRealizedValue = computed<number>(() => pos.totalRealized.value);

function onClose(position: Position): void {
  const price = currentPrice(position.symbol) ?? position.avgPrice;
  pos.closePosition(position.symbol, price);
}
</script>

<template>
  <section class="panel positions-blotter">
    <header class="panel-head">
      <h2 class="panel-title">持倉 / 損益</h2>
    </header>

    <div v-if="isEmpty" class="pb-empty">
      <p class="pb-empty-line">尚無部位</p>
      <p class="pb-empty-hint dim">前往看盤頁選股下單，建立的部位將即時顯示在此。</p>
      <NuxtLink to="/" class="pb-empty-link">前往看盤 →</NuxtLink>
    </div>

    <table v-else class="tbl pb-table">
      <thead>
        <tr>
          <th>代號(名稱)</th>
          <th>部位(張)</th>
          <th>均價</th>
          <th>現價</th>
          <th>未實現損益</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in rows" :key="p.symbol">
          <td class="sym">
            {{ p.symbol }}
            <span class="sym-name">{{ md.quotes.value[p.symbol]?.name ?? "" }}</span>
          </td>
          <td :class="lotsClass(p.lots)">{{ lotsLabel(p.lots) }}</td>
          <td>{{ formatPrice(p.avgPrice) }}</td>
          <td>{{ formatPrice(currentPrice(p.symbol)) }}</td>
          <td :class="pnlClass(pnl(p))">
            {{ formatInt(pnl(p)) }} 元
          </td>
          <td class="pb-action">
            <button class="btn-ghost pb-close" type="button" @click="onClose(p)">
              平倉
            </button>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td class="foot-label" colspan="4">總未實現</td>
          <td :class="pnlClass(totalUnrealizedValue)" colspan="2">
            {{ formatInt(totalUnrealizedValue) }} 元
          </td>
        </tr>
        <tr>
          <td class="foot-label" colspan="4">已實現</td>
          <td :class="pnlClass(totalRealizedValue)" colspan="2">
            {{ formatInt(totalRealizedValue) }} 元
          </td>
        </tr>
      </tfoot>
    </table>
  </section>
</template>

<style scoped>
/* Table chrome (dense, mono, right-aligned numerics, hover) comes from the
   shared `table.tbl` in app.css. Only blotter-specific deltas live here. */

.pb-table td,
.pb-table th {
  white-space: nowrap;
}

/* Symbol cell: mono code + muted UI name. (.tbl already mono's the column.) */
.sym {
  color: var(--text);
}

.sym-name {
  color: var(--text-3);
  font-family: var(--font-ui);
  font-size: 11px;
  margin-left: 6px;
}

/* Action column reads as a control, not a number → revert to neutral. */
.pb-action {
  text-align: right;
  font-family: var(--font-ui);
}

.pb-close {
  padding: 3px 11px;
  font-size: 11px;
  letter-spacing: 0.04em;
}

/* Footer totals: separated by a stronger hairline, mono via .tbl. */
.foot-label {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pb-table tfoot td {
  border-bottom: none;
  border-top: 1px solid var(--border-strong);
  padding-top: 9px;
  font-weight: 600;
}

/* Empty state: a guided terminal block, not a black void. */
.pb-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--gap-sm);
  padding: 22px var(--gap);
}

.pb-empty-line {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--text-2);
}

.pb-empty-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

/* Text-button link to 看盤 (/) — cyan accent, squared focus ring via theme. */
.pb-empty-link {
  display: inline-flex;
  align-items: center;
  padding: 5px 11px;
  border: 1px solid var(--accent-line);
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
  transition:
    border-color 0.12s ease,
    background 0.12s ease;
}

.pb-empty-link:hover {
  border-color: var(--accent);
  background: var(--surface-3);
}
</style>
