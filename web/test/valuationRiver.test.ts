import { describe, it, expect } from "vitest";
import type { ValuationBand } from "~/types";
import {
  projectY,
  zoneColor,
  buildRiver,
} from "~/utils/valuationRiver";

/**
 * Unit tests for the pure river geometry. A band's quantile cuts become five
 * stacked lanes on a 0..1 viewport (band max at y=0 top, min at y=1 bottom);
 * the current value projects onto the same scale with a zone-driven colour.
 */
const BAND: ValuationBand = {
  count: 20,
  min: 10,
  max: 30,
  p20: 14,
  p40: 18,
  p60: 22,
  p80: 26,
  current: 12,
  zone: "cheap",
};

describe("projectY", () => {
  it("maps max→0 (top) and min→1 (bottom)", () => {
    expect(projectY(30, 10, 30)).toBe(0);
    expect(projectY(10, 10, 30)).toBe(1);
  });

  it("maps the midpoint to 0.5", () => {
    expect(projectY(20, 10, 30)).toBe(0.5);
  });

  it("clamps out-of-range values to the edges", () => {
    expect(projectY(40, 10, 30)).toBe(0);
    expect(projectY(5, 10, 30)).toBe(1);
  });

  it("collapses a degenerate band to the middle", () => {
    expect(projectY(7, 7, 7)).toBe(0.5);
  });
});

describe("zoneColor", () => {
  it("uses the valuation idiom: cheap=紅(漲), expensive=綠(跌), fair=灰", () => {
    expect(zoneColor("cheap")).toBe("var(--up)");
    expect(zoneColor("expensive")).toBe("var(--down)");
    expect(zoneColor("fair")).toBe("var(--flat)");
  });
});

describe("buildRiver", () => {
  it("returns null for a null band (cold start)", () => {
    expect(buildRiver(null)).toBeNull();
  });

  it("builds five lanes spanning the quantile cuts in low→high order", () => {
    const geom = buildRiver(BAND)!;
    expect(geom.lanes).toHaveLength(5);

    const cheapest = geom.lanes[0]!;
    expect(cheapest.key).toBe("p0_20");
    expect(cheapest.from).toBe(10); // min
    expect(cheapest.to).toBe(14); // p20
    expect(cheapest.label).toBe("便宜");

    const dearest = geom.lanes[4]!;
    expect(dearest.key).toBe("p80_100");
    expect(dearest.from).toBe(26); // p80
    expect(dearest.to).toBe(30); // max
    expect(dearest.label).toBe("昂貴");
  });

  it("orders lanes top→bottom by valuation (cheapest lane sits at the bottom)", () => {
    const geom = buildRiver(BAND)!;
    const cheapest = geom.lanes[0]!;
    // 便宜 lane: from=10(min)→to=14; its bottom edge is the band floor (y=1).
    expect(cheapest.yBottom).toBe(1);
    expect(cheapest.yTop).toBe(projectY(14, 10, 30));
    // adjacent lanes are contiguous: lane[1].yBottom === lane[0].yTop.
    expect(geom.lanes[1]!.yBottom).toBeCloseTo(cheapest.yTop, 10);
  });

  it("places the current marker by its zone colour", () => {
    const geom = buildRiver(BAND)!;
    expect(geom.marker).not.toBeNull();
    expect(geom.marker!.value).toBe(12);
    expect(geom.marker!.zone).toBe("cheap");
    expect(geom.marker!.color).toBe("var(--up)");
    // current 12 between min 10 and max 30 → near the bottom of the river.
    expect(geom.marker!.y).toBeCloseTo(projectY(12, 10, 30), 10);
  });

  it("omits the marker when there is no current value", () => {
    const noCurrent: ValuationBand = { ...BAND, current: null, zone: null };
    const geom = buildRiver(noCurrent)!;
    expect(geom.lanes).toHaveLength(5);
    expect(geom.marker).toBeNull();
  });
});
