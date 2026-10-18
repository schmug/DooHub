import { describe, it, expect } from "vitest";
import { FULL_TIME_RANGE, formatMinutes, isAllDayOrTbd, isFullTimeRange, matchesTimeRange } from "./timeRange";
import { makeEvent } from "../test/factory";

describe("matchesTimeRange", () => {
  const at = (t: string) => makeEvent({ start: `2026-06-20T${t}:00-04:00` });
  it("bounds are start-inclusive, end-exclusive", () => {
    expect(matchesTimeRange(at("12:00"), [720, 1020], true)).toBe(true);
    expect(matchesTimeRange(at("16:59"), [720, 1020], true)).toBe(true);
    expect(matchesTimeRange(at("17:00"), [720, 1020], true)).toBe(false);
    expect(matchesTimeRange(at("11:30"), [720, 1020], true)).toBe(false);
  });
  it("a handle at the slider edge is unbounded, so pre-6 AM starts still show", () => {
    expect(matchesTimeRange(at("05:00"), [360, 720], true)).toBe(true);
    expect(matchesTimeRange(at("05:00"), [420, 720], true)).toBe(false);
    expect(matchesTimeRange(at("23:30"), [1020, 1440], true)).toBe(true);
  });
  it("midnight starts are all-day, not morning", () => {
    expect(isAllDayOrTbd(at("00:00"))).toBe(true);
    expect(matchesTimeRange(at("00:00"), [360, 720], false)).toBe(false);
    expect(matchesTimeRange(at("00:00"), [1020, 1440], true)).toBe(true);
  });
});

describe("helpers", () => {
  it("isFullTimeRange", () => {
    expect(isFullTimeRange(FULL_TIME_RANGE)).toBe(true);
    expect(isFullTimeRange([390, 1440])).toBe(false);
  });
  it("formatMinutes", () => {
    expect(formatMinutes(360)).toBe("6 AM");
    expect(formatMinutes(720)).toBe("Noon");
    expect(formatMinutes(1110)).toBe("6:30 PM");
    expect(formatMinutes(1440)).toBe("Midnight");
  });
});
