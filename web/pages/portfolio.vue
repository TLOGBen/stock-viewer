<script setup lang="ts">
// 持倉 — positions + realized/unrealized P&L. The blotter sources everything
// from the usePositions() / useMarketData() singletons, so this page is layout
// only and survives client-side navigation with live P&L intact. The account
// summary strip below is derived (read-only computeds) from those same
// singletons; the single exception is 可用資金, which the user may override
// inline to seed an arbitrary buying power for what-if simulations.
import { ref, nextTick } from "vue";
import { SHARES_PER_LOT } from "~/types";

const md = useMarketData();
const pos = usePositions();

// ── 可用資金 inline edit ──
const editingCash = ref(false);
const cashDraft = ref("");
const cashInput = ref<HTMLInputElement | null>(null);

/** Enter edit mode, seeding the draft with the current balance (raw integer). */
function startEditCash(): void {
  cashDraft.value = String(pos.cashBalance.value);
  editingCash.value = true;
  void nextTick(() => {
    cashInput.value?.focus();
    cashInput.value?.select();
  });
}

/** Commit the draft to the book (invalid input is dropped) and leave edit mode. */
function commitEditCash(): void {
  pos.setCashBalance(Number(cashDraft.value));
  editingCash.value = false;
}

/** Abandon the edit without touching the balance. */
function cancelEditCash(): void {
  editingCash.value = false;
}

/** Live price for a symbol, or null when no quote has arrived yet. */
function priceOf(symbol: string): number | null {
  return md.quotes.value[symbol]?.price ?? null;
}

/** 可用資金 — simulated buying power (TWD). */
const availableCash = computed<number>(() => pos.cashBalance.value);

/**
 * 部位市值 — gross market value of open lots at live prices (TWD).
 * Positions still missing a quote contribute nothing; long/short both count
 * their absolute exposure. null when there are open lots but no price for any.
 */
const positionsValue = computed<number | null>(() => {
  let total = 0;
  let openLots = 0;
  let pricedLots = 0;
  for (const p of Object.values(pos.positions.value)) {
    if (p.lots === 0) continue;
    openLots += Math.abs(p.lots);
    const price = priceOf(p.symbol);
    if (price === null) continue;
    pricedLots += Math.abs(p.lots);
    total += Math.abs(p.lots) * SHARES_PER_LOT * price;
  }
  if (openLots === 0) return 0;
  if (pricedLots === 0) return null;
  return total;
});

/** 未實現損益 — mark-to-market P&L across the book (TWD). */
const unrealized = computed<number>(() =>
  pos.totalUnrealized(md.quotes.value),
);

/** 已實現損益 — booked P&L across the book (TWD). */
const realized = computed<number>(() => pos.totalRealized.value);

/** 總損益 — unrealized + realized (TWD). */
const totalPnl = computed<number>(() => unrealized.value + realized.value);

/** 紅漲綠跌: profit (>0) → red (c-up), loss (<0) → green (c-down). */
function pnlClass(n: number): string {
  return signClass(directionOf(n));
}

/** Account-summary cell value: integer TWD, or em-dash when unavailable. */
function summaryValue(n: number | null): string {
  return n === null ? "—" : `${formatInt(n)} 元`;
}
</script>

<template>
  <div class="portfolio-page">
    <header class="page-head">
      <h1 class="page-title">持倉</h1>
    </header>

    <section class="account-summary" aria-label="帳戶摘要">
      <div class="statgrid summary-grid">
        <div class="stat">
          <span class="stat-k">可用資金</span>
          <input
            v-if="editingCash"
            ref="cashInput"
            v-model="cashDraft"
            class="stat-v mono cash-input"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            aria-label="編輯可用資金"
            @keydown.enter.prevent="commitEditCash"
            @keydown.esc.prevent="cancelEditCash"
            @blur="commitEditCash"
          />
          <button
            v-else
            type="button"
            class="stat-v mono cash-edit"
            title="點擊編輯可用資金"
            @click="startEditCash"
          >
            {{ summaryValue(availableCash) }}
          </button>
        </div>
        <div class="stat">
          <span class="stat-k">部位市值</span>
          <span class="stat-v mono">{{ summaryValue(positionsValue) }}</span>
        </div>
        <div class="stat">
          <span class="stat-k">未實現損益</span>
          <span class="stat-v mono" :class="pnlClass(unrealized)">
            {{ summaryValue(unrealized) }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-k">已實現損益</span>
          <span class="stat-v mono" :class="pnlClass(realized)">
            {{ summaryValue(realized) }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-k">總損益</span>
          <span class="stat-v mono" :class="pnlClass(totalPnl)">
            {{ summaryValue(totalPnl) }}
          </span>
        </div>
      </div>
    </section>

    <PositionsBlotter />
  </div>
</template>

<style scoped>
.portfolio-page {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  min-width: 0;
}

/* Terminal page header: tracked mono caps with a leading amber tick. */
.page-head {
  display: flex;
  align-items: center;
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text);
}

.page-title::before {
  content: "";
  width: 3px;
  height: 14px;
  background: var(--amber);
  border-radius: 1px;
  flex: none;
}

.account-summary {
  min-width: 0;
}

/* Dense single-row strip on wide viewports, wrapping to a grid when cramped. */
.summary-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

@media (max-width: 720px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 可用資金 is the one editable summary cell: a borderless button that reads as
   plain text but hints its affordance on hover. */
.cash-edit {
  appearance: none;
  border: 1px solid transparent;
  background: none;
  padding: 1px 4px;
  margin: -1px -4px;
  border-radius: 4px;
  font: inherit;
  color: inherit;
  text-align: inherit;
  cursor: text;
}

.cash-edit:hover {
  border-color: var(--line, rgba(255, 255, 255, 0.12));
  background: var(--surface-2, rgba(255, 255, 255, 0.04));
}

.cash-edit:focus-visible {
  outline: none;
  border-color: var(--amber);
}

.cash-input {
  width: 100%;
  min-width: 0;
  appearance: none;
  border: 1px solid var(--amber);
  background: var(--surface-2, rgba(255, 255, 255, 0.04));
  padding: 1px 4px;
  margin: -1px -4px;
  border-radius: 4px;
  font: inherit;
  color: inherit;
}

.cash-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--amber) 30%, transparent);
}
</style>
