/**
 * Pure presentation helpers for CompanyProfile.vue. No DOM, no I/O — turns a
 * raw wire-shape {@link CompanyProfile} into the rows the statgrid renders.
 *
 * The backend reports dates as packed Gregorian "YYYYMMDD" strings (e.g.
 * "19560501") and leaves unknown text fields blank. The UI shows a tracked mono
 * em-dash placeholder for anything missing rather than an empty cell, and a
 * hyphenated date for readability — without ever re-deriving or re-scaling the
 * underlying value.
 */
import type { CompanyView } from "~/types";

/** Em-dash placeholder shown for any blank / unknown field. */
export const PROFILE_BLANK = "—";

/** One key/value row in the profile statgrid. */
export interface ProfileRow {
  /** Stable key + Chinese label. */
  label: string;
  /** Already-formatted display value (never empty — falls back to「—」). */
  value: string;
}

/** Trim a raw string field, returning the「—」placeholder when blank. */
function text(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : PROFILE_BLANK;
}

/**
 * Format a packed "YYYYMMDD" date as "YYYY-MM-DD". Anything that is not exactly
 * eight digits is treated as unknown and rendered as the「—」placeholder (the
 * raw string is never reinterpreted or re-scaled).
 */
export function formatFoundDate(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!/^\d{8}$/.test(trimmed)) return PROFILE_BLANK;
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}

/**
 * Compose the statgrid rows for a covered company. The 產業別 cell pairs the raw
 * code with its resolved Chinese name (from the envelope's `industryName`) when
 * available; the code alone otherwise. Mirrors the field order of the「公司基本
 * 資料」panel in frontend-design.md — 簡介 then 股務 — with no 經營業務 row.
 */
export function profileRows(view: CompanyView): ProfileRow[] {
  const p = view.profile;
  if (p == null) return [];

  const industry = (() => {
    const code = p.industryCode.trim();
    const name = view.industryName.trim();
    if (name.length > 0) return code.length > 0 ? `${code} ${name}` : name;
    return code.length > 0 ? code : PROFILE_BLANK;
  })();

  return [
    // ── 簡介 ──
    { label: "簡稱", value: text(p.shortName) },
    { label: "產業別", value: industry },
    { label: "董事長", value: text(p.chairman) },
    { label: "總經理", value: text(p.ceo) },
    { label: "統一編號", value: text(p.taxId) },
    { label: "成立日期", value: formatFoundDate(p.foundDate) },
    { label: "上市日期", value: formatFoundDate(p.listDate) },
    // ── 股務 ──
    { label: "股務代理", value: text(p.transferAgent) },
    { label: "公司網站", value: text(p.website) },
  ];
}
