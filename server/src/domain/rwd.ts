/**
 * Shared helpers for TWSE rwd endpoints that return `{ fields: string[],
 * data: unknown[][] }` (column-ordered 2D arrays rather than named objects).
 * Columns are located by their `fields` NAME, never by a hard-coded index —
 * the column order is not contractual and silently shifts (spec basis C / R4).
 * No I/O.
 */
import { num } from "./officialClose.js";

/** Index of `name` in a rwd `fields` array; -1 when absent. */
export function colIndex(fields: readonly unknown[], name: string): number {
  for (let i = 0; i < fields.length; i += 1) {
    if (fields[i] === name) return i;
  }
  return -1;
}

/**
 * Read a numeric cell located by field name from a rwd row. Returns null when
 * the column is absent or the cell is blank/"-" (so callers degrade to
 * coverage=false rather than reading a wrong/positional value).
 */
export function cellNum(
  fields: readonly unknown[],
  row: readonly unknown[],
  name: string,
): number | null {
  const i = colIndex(fields, name);
  if (i < 0) return null;
  return num(row[i]);
}
