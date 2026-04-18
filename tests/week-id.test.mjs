import { describe, expect, it } from "vitest";
import { weekIdBrussels } from "../lib/digest/week-id.mjs";

describe("lib/digest/week-id.mjs — weekIdBrussels", () => {
  it('weekIdBrussels(2026-01-01) → "2026-W01"', () => {
    // 2026-01-01 is a Thursday — it is in Week 1 of 2026.
    expect(weekIdBrussels(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
  });

  it('weekIdBrussels(2025-12-31) → "2026-W01"', () => {
    // 2025-12-31 is a Wednesday. Its Thursday is 2026-01-01, so ISO year is 2026.
    expect(weekIdBrussels(new Date("2025-12-31T12:00:00Z"))).toBe("2026-W01");
  });

  it("weekIdBrussels returns the same weekId for all days Mon–Sun of a given week", () => {
    // Week 2026-W16: Mon 2026-04-13 → Sun 2026-04-19
    const expected = "2026-W16";
    const monToSun = [13, 14, 15, 16, 17, 18, 19].map(
      (d) => new Date(`2026-04-${String(d).padStart(2, "0")}T12:00:00Z`),
    );
    for (const date of monToSun) {
      expect(weekIdBrussels(date)).toBe(expected);
    }
  });

  it("weekIdBrussels returns different weekIds for Sunday and the following Monday", () => {
    const sunday = new Date("2026-04-19T12:00:00Z"); // still W16
    const monday = new Date("2026-04-20T12:00:00Z"); // starts W17
    expect(weekIdBrussels(sunday)).toBe("2026-W16");
    expect(weekIdBrussels(monday)).toBe("2026-W17");
  });

  it("weekIdBrussels is stable across DST spring-forward (late March 2026)", () => {
    // Brussels spring-forward: last Sunday of March 2026 = 2026-03-29 at 02:00 CET → 03:00 CEST.
    // 01:30 UTC on 2026-03-29 = 02:30 CET (before DST change, still standard time).
    // 02:30 UTC on 2026-03-29 = 04:30 CEST (after DST change, summer time).
    // Both instants are still 2026-03-29 in Brussels → same weekId.
    const beforeDst = new Date("2026-03-29T01:30:00Z");
    const afterDst = new Date("2026-03-29T02:30:00Z");
    expect(weekIdBrussels(beforeDst)).toBe(weekIdBrussels(afterDst));
  });

  it("weekIdBrussels is stable across DST fall-back (late October 2026)", () => {
    // Brussels fall-back: last Sunday of October 2026 = 2026-10-25 at 03:00 CEST → 02:00 CET.
    // Both UTC instants 00:30 and 01:30 are on the same Brussels calendar date.
    const beforeFallback = new Date("2026-10-25T00:30:00Z");
    const afterFallback = new Date("2026-10-25T01:30:00Z");
    expect(weekIdBrussels(beforeFallback)).toBe(weekIdBrussels(afterFallback));
  });

  it("weekIdBrussels output is consistent with the Brussels calendar date for 2026-W04", () => {
    // 2026-01-19 to 2026-01-25 is ISO week 4 of 2026
    expect(weekIdBrussels(new Date("2026-01-19T12:00:00Z"))).toBe("2026-W04");
    expect(weekIdBrussels(new Date("2026-01-25T12:00:00Z"))).toBe("2026-W04");
  });

  it("weekIdBrussels returns a string matching YYYY-Www", () => {
    expect(weekIdBrussels()).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("weekIdBrussels uses Brussels date boundary (late Sunday UTC that is Monday in Brussels)", () => {
    // 2025-12-28 23:30 UTC = 2025-12-29 00:30 CET (Brussels Monday)
    // The Brussels calendar date is Monday 2025-12-29 — start of 2026-W01.
    // A UTC-based implementation would see Sunday 2025-12-28 → still 2025-W52.
    const lateUtcSunday = new Date("2025-12-28T23:30:00Z");
    expect(weekIdBrussels(lateUtcSunday)).toBe("2026-W01");
  });
});
