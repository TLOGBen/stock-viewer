<script setup lang="ts">
/**
 * Order confirmation modal (TP-7). Shows the order subject, side, type/tif,
 * quantity, price and the fee breakdown + buying-power line, with a
 * 「不再提醒」 checkbox. Emits confirm(dontAskAgain) / cancel. A11y: a fixed
 * overlay with role=dialog, aria-modal, ESC-to-cancel and a labelled title.
 */
import { ref } from "vue";
import type {
  OrderSide,
  OrderType,
  TimeInForce,
  OrderUnit,
} from "~/types";
import type { FeeBreakdown } from "~/utils/fees";
import { formatInt, formatPriceBanded } from "~/utils/format";

const props = defineProps<{
  symbol: string;
  name: string;
  side: OrderSide;
  type: OrderType;
  tif: TimeInForce;
  lots: number;
  unit: OrderUnit;
  price: number;
  stopPrice?: number | null;
  isEtf?: boolean;
  fee: FeeBreakdown;
  cashBalance: number;
}>();

const emit = defineEmits<{
  (e: "confirm", dontAskAgain: boolean): void;
  (e: "cancel"): void;
}>();

const dontAskAgain = ref<boolean>(false);

const TYPE_LABEL: Record<OrderType, string> = {
  market: "市價",
  limit: "限價",
  stop: "停損",
  stop_limit: "停損限價",
};

function onConfirm(): void {
  emit("confirm", dontAskAgain.value);
}

function onCancel(): void {
  emit("cancel");
}

function onOverlayKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") onCancel();
}
</script>

<template>
  <div
    class="cod-overlay"
    @click.self="onCancel"
    @keydown="onOverlayKeydown"
  >
    <div
      class="cod-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cod-title"
    >
      <header class="cod-head">
        <h2 id="cod-title" class="cod-title">確認下單</h2>
        <button
          class="cod-close"
          type="button"
          aria-label="取消"
          @click="onCancel"
        >
          ×
        </button>
      </header>

      <div class="cod-body">
        <div class="cod-subject">
          <span class="cod-sym mono">{{ props.symbol }}</span>
          <span class="cod-name">{{ props.name }}</span>
          <span
            class="cod-side"
            :class="props.side === 'buy' ? 'c-up' : 'c-down'"
          >
            {{ props.side === "buy" ? "買進" : "賣出" }}
          </span>
        </div>

        <dl class="cod-grid">
          <dt>訂單種類</dt>
          <dd>{{ TYPE_LABEL[props.type] }}</dd>

          <dt>效期</dt>
          <dd>{{ props.tif }}</dd>

          <dt>數量</dt>
          <dd class="num">
            {{ formatInt(props.lots) }}
            {{ props.unit === "lot" ? "張" : "股" }}
          </dd>

          <dt v-if="props.type !== 'market'">價格</dt>
          <dd v-if="props.type !== 'market'" class="num">
            {{ formatPriceBanded(props.price, props.isEtf) }}
          </dd>

          <template
            v-if="props.stopPrice != null && props.stopPrice > 0"
          >
            <dt>停損價</dt>
            <dd class="num">{{ formatPriceBanded(props.stopPrice, props.isEtf) }}</dd>
          </template>
        </dl>

        <dl class="cod-fees">
          <div class="cod-fee-row">
            <dt class="dim">成交金額</dt>
            <dd class="mono num">{{ formatInt(props.fee.gross) }}</dd>
          </div>
          <div class="cod-fee-row">
            <dt class="dim">手續費</dt>
            <dd class="mono num">{{ formatInt(props.fee.commission) }}</dd>
          </div>
          <div class="cod-fee-row">
            <dt class="dim">交易稅</dt>
            <dd class="mono num">{{ formatInt(props.fee.tax) }}</dd>
          </div>
          <div class="cod-fee-row cod-fee-net">
            <dt>{{ props.side === "buy" ? "應付淨額" : "可得淨額" }}</dt>
            <dd class="mono num">{{ formatInt(props.fee.net) }}</dd>
          </div>
        </dl>

        <p class="cod-power">
          <span class="dim">可用資金</span>
          <span class="cod-power-amt mono num">{{ formatInt(props.cashBalance) }} 元</span>
        </p>

        <label class="cod-remember">
          <input v-model="dontAskAgain" type="checkbox" />
          <span>不再提醒</span>
        </label>
      </div>

      <footer class="cod-actions">
        <button class="btn btn-ghost" type="button" @click="onCancel">
          取消
        </button>
        <button
          class="btn"
          :class="props.side === 'buy' ? 'btn-buy' : 'btn-sell'"
          type="button"
          @click="onConfirm"
        >
          {{ props.side === "buy" ? "確認買進" : "確認賣出" }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.cod-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.66);
  backdrop-filter: blur(2px);
}

/* Terminal-style modal: flat surface, hairline frame, sharp radius, token shadow. */
.cod-dialog {
  width: 100%;
  max-width: 380px;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: auto;
}

.cod-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 13px;
  border-bottom: 1px solid var(--hairline);
  background: var(--surface-2);
}

/* amber-ticked tracked uppercase mono title (matches .panel-title treatment) */
.cod-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-2);
}

.cod-title::before {
  content: "";
  width: 3px;
  height: 12px;
  background: var(--amber);
  border-radius: 1px;
  flex: none;
}

.cod-close {
  background: none;
  border: none;
  color: var(--text-3);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}

.cod-close:hover {
  color: var(--text);
}

.cod-body {
  padding: 13px;
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
}

.cod-subject {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cod-sym {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}

.cod-name {
  color: var(--text-2);
  font-size: 13px;
}

.cod-side {
  margin-left: auto;
  font-size: 15px;
  font-weight: 700;
}

.cod-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 12px;
  margin: 0;
}

.cod-grid dt {
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.cod-grid dd {
  margin: 0;
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--text);
}

.cod-fees {
  margin: 0;
  padding: 9px 0;
  border-top: 1px solid var(--hairline);
  border-bottom: 1px solid var(--hairline);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.cod-fee-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.cod-fee-row dt {
  font-size: 11.5px;
}

.cod-fee-row dd {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
}

.cod-fee-net {
  margin-top: 2px;
  padding-top: 6px;
  border-top: 1px solid var(--hairline);
}

.cod-fee-net dt {
  color: var(--text);
  font-weight: 600;
  font-size: 12.5px;
}

.cod-fee-net dd {
  color: var(--text);
  font-weight: 700;
  font-size: 15px;
}

.cod-power {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.cod-power-amt {
  color: var(--text-2);
}

.cod-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}

.cod-remember input {
  accent-color: var(--accent);
}

.cod-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--gap-sm);
  padding: 11px 13px;
  border-top: 1px solid var(--hairline);
  background: var(--surface-2);
}

.cod-actions .btn {
  padding: 10px 0;
  font-size: 13px;
  font-weight: 700;
}
</style>
