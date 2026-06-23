<script setup lang="ts">
/**
 * Mock order ticket (TP-1/2/4/5/6/7, PQ-1 step). A real ticket with a
 * Buy/Sell segmented toggle (recolors submit), 訂單種類 / 效期 selects,
 * 張/股 unit toggle, tick-aware price step+decimals, a live fee + buying-power
 * estimate (fees.ts) and a confirmation flow gated by useOrderPrefs.
 */
import { ref, computed, watch, onMounted } from "vue";
import type {
  OrderSide,
  OrderType,
  TimeInForce,
  OrderUnit,
  OrderRequest,
  InstrumentMeta,
} from "~/types";
import { SHARES_PER_LOT } from "~/types";
import { computeFees, type FeeBreakdown } from "~/utils/fees";
import { tickSizeFor } from "~/utils/tickSize";
import { formatInt } from "~/utils/format";

const md = useMarketData();
const pos = usePositions();
const prefs = useOrderPrefs();
const { fetchInstruments } = useApi();

// ── ticket form state ──
const side = ref<OrderSide>("buy");
const orderType = ref<OrderType>("limit");
const tif = ref<TimeInForce>("ROD");
const unit = ref<OrderUnit>("lot");
const lots = ref<number>(1);
const price = ref<number>(0);
const stopPrice = ref<number>(0);
const priceTouched = ref<boolean>(false);
const showConfirm = ref<boolean>(false);

// ── instrument meta (lotSize / isEtf) ──
// useMarketData carries no meta, so resolve it from /api/instruments once and
// fall back to a code heuristic (台股 ETF 代號以 "00" 開頭) when absent.
const metaBySymbol = ref<Record<string, InstrumentMeta>>({});

onMounted(async () => {
  try {
    const list = await fetchInstruments();
    const next: Record<string, InstrumentMeta> = {};
    for (const m of list) next[m.symbol] = m;
    metaBySymbol.value = next;
  } catch (error) {
    console.error("OrderTicket: instrument meta load failed", error);
  }
});

const selectedMeta = computed<InstrumentMeta | null>(
  () => metaBySymbol.value[md.selected.value] ?? null,
);

const isEtf = computed<boolean>(() => {
  const m = selectedMeta.value;
  if (m?.isEtf !== undefined) return m.isEtf;
  if (m?.type === "etf") return true;
  // Heuristic: Taiwan ETF symbols start with "00" (e.g. 0050, 00878).
  return /^00/.test(md.selected.value);
});

const lotSize = computed<number>(() => {
  const s = selectedMeta.value?.lotSize;
  return typeof s === "number" && s > 0 ? s : SHARES_PER_LOT;
});

const tickKind = computed<"stock" | "etf">(() =>
  isEtf.value ? "etf" : "stock",
);

const hasQuote = computed<boolean>(() => md.selectedQuote.value != null);

// ── price sync with live quote (only while untouched) ──
watch(
  () => md.selected.value,
  () => {
    priceTouched.value = false;
    const q = md.selectedQuote.value;
    if (q && q.price != null) price.value = q.price;
  },
);

watch(
  () => md.selectedQuote.value?.price ?? null,
  (p) => {
    if (!priceTouched.value && p != null) price.value = p;
  },
  { immediate: true },
);

function onPriceInput(): void {
  priceTouched.value = true;
}

// ── derived form helpers ──
const usesLimitPrice = computed<boolean>(
  () => orderType.value === "limit" || orderType.value === "stop_limit",
);
const usesStopPrice = computed<boolean>(
  () => orderType.value === "stop" || orderType.value === "stop_limit",
);

// Price step + decimals follow the tick ladder for the current price level.
const priceStep = computed<number>(
  () => tickSizeFor(Number(price.value) || 0, tickKind.value).step,
);

const normalizedLots = computed<number>(() => {
  const n = Math.floor(Number(lots.value));
  return Number.isFinite(n) && n >= 1 ? n : 0;
});

// Effective price used for the fill estimate: market orders fill at the live
// quote; pure stop (stop-market) fills at the trigger price; limit/stop-limit
// use the entered limit price.
const effectivePrice = computed<number>(() => {
  if (orderType.value === "market") {
    return md.selectedQuote.value?.price ?? 0;
  }
  if (orderType.value === "stop") {
    return Number(stopPrice.value) || md.selectedQuote.value?.price || 0;
  }
  return Number(price.value) || 0;
});

const unitLabel = computed<string>(() => (unit.value === "lot" ? "張" : "股"));

// ── fee + buying-power estimate ──
const fee = computed<FeeBreakdown>(() =>
  computeFees({
    side: side.value,
    price: effectivePrice.value,
    lots: normalizedLots.value,
    unit: unit.value,
    isEtf: isEtf.value,
  }),
);

const affordable = computed<boolean>(() =>
  pos.canAfford(fee.value, side.value),
);

const subject = computed<string>(() => {
  const q = md.selectedQuote.value;
  if (!q) return "—";
  return `${q.symbol} ${q.name}`;
});

const priceValid = computed<boolean>(() => {
  if (orderType.value === "market") {
    return (md.selectedQuote.value?.price ?? 0) > 0;
  }
  if (usesLimitPrice.value && !(Number(price.value) > 0)) return false;
  if (usesStopPrice.value && !(Number(stopPrice.value) > 0)) return false;
  return true;
});

const canSubmit = computed<boolean>(
  () =>
    hasQuote.value &&
    normalizedLots.value >= 1 &&
    priceValid.value &&
    affordable.value,
);

function buildOrder(): OrderRequest | null {
  if (!canSubmit.value) return null;
  const symbol = md.selected.value;
  const order: OrderRequest = {
    symbol,
    side: side.value,
    lots: normalizedLots.value,
    price: effectivePrice.value,
    type: orderType.value,
    tif: tif.value,
    unit: unit.value,
  };
  if (usesStopPrice.value && Number(stopPrice.value) > 0) {
    return { ...order, stopPrice: Number(stopPrice.value) };
  }
  return order;
}

function submit(order: OrderRequest): void {
  pos.submitOrder(order, fee.value);
}

function onSubmitClick(): void {
  if (!canSubmit.value) return;
  if (prefs.skipConfirm.value) {
    const order = buildOrder();
    if (order) submit(order);
    return;
  }
  showConfirm.value = true;
}

function onConfirm(dontAskAgain: boolean): void {
  if (dontAskAgain) prefs.setSkipConfirm(true);
  showConfirm.value = false;
  const order = buildOrder();
  if (order) submit(order);
}

function onCancel(): void {
  showConfirm.value = false;
}
</script>

<template>
  <section class="panel order-ticket">
    <header class="panel-head">
      <h2 class="panel-title">模擬下單</h2>
      <span class="subject">{{ subject }}</span>
    </header>

    <div class="ticket-body">
      <!-- Buy / Sell segmented toggle -->
      <div class="ot-seg" role="group" aria-label="買賣方向">
        <button
          class="ot-seg-btn"
          :class="{ 'is-buy': side === 'buy' }"
          type="button"
          :aria-pressed="side === 'buy'"
          @click="side = 'buy'"
        >
          買進
        </button>
        <button
          class="ot-seg-btn"
          :class="{ 'is-sell': side === 'sell' }"
          type="button"
          :aria-pressed="side === 'sell'"
          @click="side = 'sell'"
        >
          賣出
        </button>
      </div>

      <!-- 訂單種類 -->
      <label class="field ot-field">
        <span class="ot-label">訂單種類</span>
        <select
          v-model="orderType"
          class="ot-input ot-select"
          :disabled="!hasQuote"
        >
          <option value="market">市價</option>
          <option value="limit">限價</option>
          <option value="stop">停損</option>
          <option value="stop_limit">停損限價</option>
        </select>
      </label>

      <!-- 效期 -->
      <label class="field ot-field">
        <span class="ot-label">效期</span>
        <select
          v-model="tif"
          class="ot-input ot-select"
          :disabled="!hasQuote"
        >
          <option value="ROD">ROD 當日有效</option>
          <option value="IOC">IOC 立即成交否則取消</option>
          <option value="FOK">FOK 全部成交否則取消</option>
        </select>
      </label>

      <!-- 張/股 unit toggle -->
      <div class="ot-field">
        <span class="ot-label">單位</span>
        <div class="ot-seg ot-seg-sm" role="group" aria-label="交易單位">
          <button
            class="ot-seg-btn"
            :class="{ 'is-on': unit === 'lot' }"
            type="button"
            :aria-pressed="unit === 'lot'"
            :disabled="!hasQuote"
            @click="unit = 'lot'"
          >
            張
          </button>
          <button
            class="ot-seg-btn"
            :class="{ 'is-on': unit === 'share' }"
            type="button"
            :aria-pressed="unit === 'share'"
            :disabled="!hasQuote"
            @click="unit = 'share'"
          >
            股
          </button>
        </div>
      </div>

      <!-- quantity -->
      <label class="field ot-field">
        <span class="ot-label">數量（{{ unitLabel }}）</span>
        <input
          v-model.number="lots"
          class="ot-input"
          type="number"
          min="1"
          step="1"
          inputmode="numeric"
          :disabled="!hasQuote"
        />
      </label>

      <!-- limit price -->
      <label v-if="usesLimitPrice" class="field ot-field">
        <span class="ot-label">價格</span>
        <input
          v-model.number="price"
          class="ot-input"
          type="number"
          min="0"
          :step="priceStep"
          inputmode="decimal"
          :disabled="!hasQuote"
          @input="onPriceInput"
        />
      </label>

      <!-- stop price -->
      <label v-if="usesStopPrice" class="field ot-field">
        <span class="ot-label">停損價</span>
        <input
          v-model.number="stopPrice"
          class="ot-input"
          type="number"
          min="0"
          :step="priceStep"
          inputmode="decimal"
          :disabled="!hasQuote"
        />
      </label>

      <!-- estimate — dense mono label/value rows -->
      <dl class="ot-estimate">
        <div class="ot-est-row">
          <dt class="dim">成交金額</dt>
          <dd class="mono num">{{ formatInt(fee.gross) }}</dd>
        </div>
        <div class="ot-est-row">
          <dt class="dim">手續費</dt>
          <dd class="mono num">{{ formatInt(fee.commission) }}</dd>
        </div>
        <div class="ot-est-row">
          <dt class="dim">交易稅</dt>
          <dd class="mono num">{{ formatInt(fee.tax) }}</dd>
        </div>
        <div class="ot-est-row ot-est-net">
          <dt>{{ side === "buy" ? "預估應付" : "預估可得" }}</dt>
          <dd class="mono num">{{ formatInt(fee.net) }} 元</dd>
        </div>
      </dl>

      <p class="ot-power" :class="{ 'is-short': !affordable }">
        <span class="dim">可用資金</span>
        <span class="ot-power-amt mono num">{{ formatInt(pos.cashBalance.value) }} 元</span>
      </p>
      <p v-if="!affordable && hasQuote" class="ot-warn" role="alert">
        資金不足
      </p>

      <!-- submit -->
      <div class="ot-actions">
        <button
          class="btn"
          :class="side === 'buy' ? 'btn-buy' : 'btn-sell'"
          type="button"
          :disabled="!canSubmit"
          @click="onSubmitClick"
        >
          {{ side === "buy" ? "買進" : "賣出" }}
        </button>
      </div>
    </div>

    <ConfirmOrderDialog
      v-if="showConfirm && md.selectedQuote.value"
      :symbol="md.selectedQuote.value.symbol"
      :name="md.selectedQuote.value.name"
      :side="side"
      :type="orderType"
      :tif="tif"
      :lots="normalizedLots"
      :unit="unit"
      :price="effectivePrice"
      :stop-price="usesStopPrice ? Number(stopPrice) : null"
      :is-etf="isEtf"
      :fee="fee"
      :cash-balance="pos.cashBalance.value"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </section>
</template>

<style scoped>
.order-ticket {
  display: flex;
  flex-direction: column;
}

.subject {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--text-2);
}

.ticket-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  padding: 11px;
}

/* segmented control — squared cells, hairline frame, no rounding */
.ot-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  padding: 1px;
  background: var(--hairline);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.ot-seg-sm {
  max-width: 60%;
}

.ot-seg-btn {
  padding: 8px 0;
  border: 1px solid transparent;
  border-radius: 0;
  background: var(--surface-2);
  color: var(--text-3);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}

.ot-seg-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 買進 active — red (漲) */
.ot-seg-btn.is-buy {
  background: var(--up-soft);
  border-color: var(--up-line);
  color: var(--up);
}

/* 賣出 active — green (跌) */
.ot-seg-btn.is-sell {
  background: var(--down-soft);
  border-color: var(--down-line);
  color: var(--down);
}

/* 張/股 selected — cyan accent border + soft fill */
.ot-seg-btn.is-on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}

.ot-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-sm);
}

/* label-left: small tracked uppercase mono terminal label */
.ot-label {
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-3);
}

.ot-input {
  flex: 1 1 auto;
  max-width: 60%;
  padding: 7px 10px;
  background: var(--bg-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  text-align: right;
}

.ot-select {
  text-align: left;
  font-family: var(--font-ui);
}

.ot-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--accent-soft) 0 0 0 3px;
}

.ot-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* estimate — dense mono ledger, hairline divided */
.ot-estimate {
  margin: 2px 0 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 0 0;
  border-top: 1px solid var(--hairline);
}

.ot-est-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.ot-est-row dt {
  font-size: 11.5px;
}

.ot-est-row dd {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
}

/* 預估應付 — emphasized terminal total */
.ot-est-net {
  margin-top: 3px;
  padding-top: 7px;
  border-top: 1px solid var(--hairline);
}

.ot-est-net dt {
  color: var(--text);
  font-weight: 600;
  font-size: 12.5px;
}

.ot-est-net dd {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.ot-power {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.ot-power-amt {
  color: var(--text-2);
}

.ot-power.is-short .ot-power-amt {
  color: var(--bad);
}

.ot-warn {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--bad);
  text-align: right;
}

.ot-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--gap-sm);
  margin-top: 3px;
}

/* full-width submit; color comes from shared .btn-buy / .btn-sell */
.ot-actions .btn {
  width: 100%;
  padding: 11px 0;
  font-size: 14px;
}
</style>
