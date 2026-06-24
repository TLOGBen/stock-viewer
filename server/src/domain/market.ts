/**
 * Trading-session classification for the Taiwan equity market. Pure — no I/O,
 * no env. The wall-clock window is a domain constant; callers may inject an
 * alternative window for testing or deployment overrides.
 */
import type { MarketStatus, Session } from "./types.js";

const MS_PER_MINUTE = 60_000;

/** Regular Taiwan equity session, in minutes since midnight TPE (UTC+8, no DST). */
export interface SessionConfig {
  openMinute: number; // 09:00
  closeMinute: number; // 13:30
  preOpenMinute: number; // 08:30 pre-market
  tzOffsetMinutes: number; // TPE is UTC+8
}

/** Canonical Taiwan equity regular session window — single source of truth. */
export const SESSION: SessionConfig = {
  openMinute: 9 * 60, // 09:00
  closeMinute: 13 * 60 + 30, // 13:30
  preOpenMinute: 8 * 60 + 30, // 08:30 pre-market
  tzOffsetMinutes: 8 * 60, // TPE is UTC+8, no DST
};

const LABEL_BY_SESSION: Record<Session, string> = {
  pre: "盤前",
  open: "開盤中",
  closed: "休市",
};

/** Classify the trading session for `now` against the TPE wall clock. */
export function computeMarketStatus(
  now: number,
  session: SessionConfig = SESSION,
): MarketStatus {
  const shifted = new Date(now + session.tzOffsetMinutes * MS_PER_MINUTE);
  const weekday = shifted.getUTCDay(); // 0 = Sun ... 6 = Sat
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();

  const isWeekend = weekday === 0 || weekday === 6;
  const { preOpenMinute, openMinute, closeMinute } = session;

  let sess: Session;
  if (isWeekend || minutes < preOpenMinute || minutes >= closeMinute) {
    sess = "closed";
  } else if (minutes < openMinute) {
    sess = "pre";
  } else {
    sess = "open";
  }

  return {
    isOpen: sess === "open",
    session: sess,
    serverTime: now,
    label: LABEL_BY_SESSION[sess],
  };
}
