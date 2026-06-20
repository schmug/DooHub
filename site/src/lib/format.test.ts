import { describe, it, expect } from "vitest";
import { budgetColorVar, dayKey, formatTimeRange, slugify, timeOfDay, weatherIcon } from "./format";

describe("dayKey", () => {
  it("returns the NY-local date", () => {
    expect(dayKey("2026-06-20T18:00:00-04:00")).toBe("2026-06-20");
  });
  it("keeps late-evening events on their local date (no UTC rollover)", () => {
    expect(dayKey("2026-06-20T23:00:00-04:00")).toBe("2026-06-20");
    expect(dayKey("2026-06-20T01:00:00-04:00")).toBe("2026-06-20");
  });
});

describe("timeOfDay", () => {
  it("buckets by NY-local hour", () => {
    expect(timeOfDay("2026-06-20T08:00:00-04:00")).toBe("morning");
    expect(timeOfDay("2026-06-20T11:59:00-04:00")).toBe("morning");
    expect(timeOfDay("2026-06-20T12:00:00-04:00")).toBe("afternoon");
    expect(timeOfDay("2026-06-20T16:59:00-04:00")).toBe("afternoon");
    expect(timeOfDay("2026-06-20T17:00:00-04:00")).toBe("evening");
    expect(timeOfDay("2026-06-20T21:00:00-04:00")).toBe("evening");
  });
});

describe("formatTimeRange", () => {
  it("collapses a shared meridiem", () => {
    expect(formatTimeRange("2026-06-20T14:00:00-04:00", "2026-06-20T17:00:00-04:00")).toBe("2–5 PM");
  });
  it("keeps both meridiems when they differ", () => {
    expect(formatTimeRange("2026-06-20T11:00:00-04:00", "2026-06-20T13:00:00-04:00")).toBe("11 AM – 1 PM");
  });
  it("includes minutes when non-zero and handles no end time", () => {
    expect(formatTimeRange("2026-06-20T14:30:00-04:00")).toBe("2:30 PM");
  });
});

describe("budgetColorVar", () => {
  it("maps each budget tier to a CSS var", () => {
    expect(budgetColorVar("$")).toBe("var(--b-1)");
    expect(budgetColorVar("$$")).toBe("var(--b-2)");
    expect(budgetColorVar("$$$")).toBe("var(--b-3)");
    expect(budgetColorVar("$$$$")).toBe("var(--b-4)");
    expect(budgetColorVar("unknown")).toBe("var(--ink-3)");
  });
});

describe("weatherIcon", () => {
  it("matches common summaries", () => {
    expect(weatherIcon("Sunny")).toBe("☀️");
    expect(weatherIcon("Light rain")).toBe("🌧️");
    expect(weatherIcon("Thunderstorms")).toBe("⛈️");
    expect(weatherIcon("Partly cloudy")).toBe("⛅");
  });
});

describe("slugify", () => {
  it("produces a filename-safe slug", () => {
    expect(slugify("Wine, Cheese & Jazz!")).toBe("wine-cheese-jazz");
    expect(slugify("   ")).toBe("events");
  });
});
