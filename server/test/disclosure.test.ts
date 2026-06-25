import { describe, expect, it } from "vitest";

import { parseDisclosureRow, rocPackedDate } from "../src/domain/disclosure.js";

// Real t187ap04_L row (probed live). NOTE: the 主旨 key carries a trailing space.
const row3024: Record<string, unknown> = {
  出表日期: "1150625",
  發言日期: "1150624",
  發言時間: "64502",
  公司代號: "3024",
  公司名稱: "憶聲",
  "主旨 ": "公告本公司訂定除息基準日",
  符合條款: "第14款",
  事實發生日: "1150624",
};

describe("rocPackedDate — packed ROC YYYMMDD", () => {
  it("parses 1150624 → 2026-06-24 UTC midnight", () => {
    expect(rocPackedDate("1150624")).toBe(Date.UTC(2026, 5, 24));
  });
  it("rejects malformed / out-of-range with NaN", () => {
    expect(rocPackedDate("115062")).toBeNaN(); // 6 digits
    expect(rocPackedDate("1151324")).toBeNaN(); // month 13
    expect(rocPackedDate("")).toBeNaN();
  });
});

describe("parseDisclosureRow — t187ap04_L 重大訊息", () => {
  it("maps the real 3024 row, reading the trailing-space 主旨 key", () => {
    const d = parseDisclosureRow(row3024);
    expect(d?.symbol).toBe("3024");
    expect(d?.subject).toBe("公告本公司訂定除息基準日");
    expect(d?.dateRoc).toBe("1150624");
    expect(d?.date).toBe(Date.UTC(2026, 5, 24));
    expect(d?.time).toBe("64502");
  });

  it("falls back to a no-trailing-space 主旨 key", () => {
    const d = parseDisclosureRow({ 公司代號: "2330", 主旨: "X", 發言日期: "1150101" });
    expect(d?.subject).toBe("X");
  });

  it("returns null when 公司代號 is missing", () => {
    expect(parseDisclosureRow({ "主旨 ": "x" })).toBeNull();
  });
});
