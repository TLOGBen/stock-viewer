import type { Disclosure } from "../domain/index.js";
import { recentTradingDays } from "../domain/index.js";
import { DEFAULT_RECENT_DAYS, type DisclosureCache } from "./stockPageDeps.js";

/**
 * usecase/getDisclosures — resolve the 個股頁 「個股重大訊息」 block (official
 * material announcements, t187ap04_L; no view counts). Sweeps the accumulated
 * by-date window and slices each day's whole-market map for the symbol, which
 * yields the announcements that appeared in any accumulated snapshot. The feed
 * is "recent announcements", so the SAME announcement recurs across consecutive
 * days' snapshots — de-duplicate by (date,time,subject), newest-first, capped.
 *
 * A stock with no recent disclosures simply yields an empty list (coverage
 * false) — that is honest, not a failure. Never throws.
 */

/** How many of the symbol's most recent disclosures to surface. */
const DISCLOSURE_CAP = 30;

/** Narrow deps subset for getDisclosures. */
export interface GetDisclosuresDeps {
  disclosures: DisclosureCache;
}

/** The 重大訊息 view: de-duplicated announcements, newest-first. */
export interface DisclosuresView {
  symbol: string;
  coverage: boolean;
  items: Disclosure[];
}

export async function getDisclosures(
  deps: GetDisclosuresDeps,
  symbol: string,
  now: Date = new Date(),
  windowDays: number = DEFAULT_RECENT_DAYS,
): Promise<DisclosuresView> {
  try {
    const dates = recentTradingDays(now, windowDays);
    const days = await deps.disclosures.getRecentDays(dates);
    const seen = new Set<string>();
    const items: Disclosure[] = [];
    for (const { map } of days) {
      const dayItems = map.get(symbol);
      if (dayItems == null) continue;
      for (const d of dayItems) {
        const key = `${d.dateRoc}|${d.time}|${d.subject}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(d);
      }
    }
    // Newest-first: 發言日期 desc, then 發言時間 desc.
    items.sort((a, b) => {
      const da = Number.isFinite(a.date) ? a.date : 0;
      const db = Number.isFinite(b.date) ? b.date : 0;
      if (db !== da) return db - da;
      return b.time.localeCompare(a.time);
    });
    return {
      symbol,
      coverage: items.length > 0,
      items: items.slice(0, DISCLOSURE_CAP),
    };
  } catch (err) {
    console.error(`[getDisclosures] ${symbol} failed:`, err);
    return { symbol, coverage: false, items: [] };
  }
}
