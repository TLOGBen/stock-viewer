/**
 * Per-symbol 個股頁 resource composables. Each one wraps a never-throw useApi
 * fetcher and re-loads whenever the viewed symbol changes — the same SSR-safe,
 * request-sequence-guarded lifecycle as `useStats` / `useKlines`.
 *
 * Status is resolved by the pure helpers in utils/stockSignals:
 *  - object resources (company / health-lights): null ⇒ error, coverage=false ⇒
 *    empty, else success.
 *  - series resources (revenue / institutional / margin / valuation): null ⇒
 *    error, empty series ⇒ empty, < minPeriods ⇒ accumulating, else success.
 *
 * Empty/blank symbols resolve to idle without hitting the network. All ref
 * updates are immutable assignments.
 */
import { ref, watch, onMounted, type Ref } from "vue";
import type {
  ResourceStatus,
  CompanyView,
  RevenueView,
  FinancialsView,
  DividendsView,
  InstitutionalView,
  MarginView,
  ValuationView,
  HealthLights,
  DisclosuresView,
} from "~/types";
import {
  resolveObjectStatus,
  resolveSeriesStatus,
} from "~/utils/stockSignals";

/** The common surface every stock-page resource composable returns. */
export interface UseStockResource<T> {
  data: Ref<T | null>;
  status: Ref<ResourceStatus>;
  reload: () => Promise<void>;
}

/**
 * Build a per-symbol resource composable from a never-throw fetcher and a status
 * resolver. The resolver maps a fetch result (or `null`) onto a ResourceStatus.
 */
function makeStockResource<T>(
  fetcher: (symbol: string) => Promise<T | null>,
  resolve: (result: T | null) => ResourceStatus,
): (symbolRef: Ref<string>) => UseStockResource<T> {
  return (symbolRef: Ref<string>): UseStockResource<T> => {
    const data: Ref<T | null> = ref(null) as Ref<T | null>;
    const status: Ref<ResourceStatus> = ref("idle");

    let requestSeq = 0;

    async function load(symbol: string): Promise<void> {
      const trimmed = symbol.trim();
      const seq = ++requestSeq;

      if (trimmed.length === 0) {
        data.value = null;
        status.value = "idle";
        return;
      }

      status.value = "loading";
      // fetcher is never-throw (returns null on failure); the try/catch is a
      // belt-and-braces guard so the resource can never throw into the UI.
      try {
        const result = await fetcher(trimmed);
        if (seq !== requestSeq) return; // superseded by a newer symbol
        data.value = result;
        status.value = resolve(result);
      } catch (error) {
        if (seq !== requestSeq) return;
        console.error("useStockResource: fetch failed", error);
        data.value = null;
        status.value = "error";
      }
    }

    function reload(): Promise<void> {
      return load(symbolRef.value);
    }

    watch(symbolRef, (next) => {
      void load(next);
    });

    onMounted(() => {
      if (!import.meta.client) return;
      void load(symbolRef.value);
    });

    return { data, status, reload };
  };
}

/** 公司基本資料. coverage=false ⇒ empty. */
export function useCompany(symbolRef: Ref<string>): UseStockResource<CompanyView> {
  const { fetchCompany } = useApi();
  return makeStockResource(fetchCompany, resolveObjectStatus)(symbolRef);
}

/**
 * 月營收序列. A plain table renders any month it has — even a single cold-start
 * period — so minPeriods=1 (no accumulating gate). The「累積中」gate is reserved
 * for derived indicators that need N periods to be meaningful (e.g. 河流圖 band),
 * not a raw listing.
 */
export function useRevenue(symbolRef: Ref<string>): UseStockResource<RevenueView> {
  const { fetchRevenue } = useApi();
  return makeStockResource<RevenueView>(fetchRevenue, (r) =>
    resolveSeriesStatus(r?.series.length ?? null, r != null, 1),
  )(symbolRef);
}

/** 損益/資產負債 + ROE/負債比. coverage=false ⇒ empty. */
export function useFinancials(
  symbolRef: Ref<string>,
): UseStockResource<FinancialsView> {
  const { fetchFinancials } = useApi();
  return makeStockResource(fetchFinancials, resolveObjectStatus)(symbolRef);
}

/** 股利/除權息. coverage=false ⇒ empty. */
export function useDividends(
  symbolRef: Ref<string>,
): UseStockResource<DividendsView> {
  const { fetchDividends } = useApi();
  return makeStockResource(fetchDividends, resolveObjectStatus)(symbolRef);
}

/** 三大法人. empty days ⇒ empty (no accumulating gate — any day is meaningful). */
export function useInstitutional(
  symbolRef: Ref<string>,
): UseStockResource<InstitutionalView> {
  const { fetchInstitutional } = useApi();
  return makeStockResource<InstitutionalView>(fetchInstitutional, (r) =>
    resolveSeriesStatus(r?.days.length ?? null, r != null),
  )(symbolRef);
}

/** 融資融券. empty days ⇒ empty. */
export function useMargin(symbolRef: Ref<string>): UseStockResource<MarginView> {
  const { fetchMargin } = useApi();
  return makeStockResource<MarginView>(fetchMargin, (r) =>
    resolveSeriesStatus(r?.days.length ?? null, r != null),
  )(symbolRef);
}

/**
 * PE/PB 河流圖. A band needs a few real points before its quantiles mean
 * anything, so a series shorter than 5 points shows「歷史累積中」(REQ-010).
 */
export function useValuation(
  symbolRef: Ref<string>,
): UseStockResource<ValuationView> {
  const { fetchValuation } = useApi();
  return makeStockResource<ValuationView>(fetchValuation, (r) =>
    resolveSeriesStatus(r?.series.length ?? null, r != null, 5),
  )(symbolRef);
}

/** 個股重大訊息. empty items ⇒ empty (no accumulating gate — any announcement is meaningful). */
export function useDisclosures(
  symbolRef: Ref<string>,
): UseStockResource<DisclosuresView> {
  const { fetchDisclosures } = useApi();
  return makeStockResource<DisclosuresView>(fetchDisclosures, (r) =>
    resolveSeriesStatus(r?.items.length ?? null, r != null),
  )(symbolRef);
}

/** 四燈號健診. Present ⇒ success (no coverage gate; faces carry their own). */
export function useHealthLights(
  symbolRef: Ref<string>,
): UseStockResource<HealthLights> {
  const { fetchHealthLights } = useApi();
  return makeStockResource(fetchHealthLights, resolveObjectStatus)(symbolRef);
}
