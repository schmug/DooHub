import { describe, it, expect } from "vitest";
import { makeEvent } from "../test/factory";
import { parsePrice, summarizeSelection } from "./selectionSummary";

describe("parsePrice", () => {
  it("reads a free event as zero", () => {
    expect(parsePrice("Free")).toEqual({ min: 0, max: 0 });
    expect(parsePrice("free")).toEqual({ min: 0, max: 0 });
    expect(parsePrice("FREE")).toEqual({ min: 0, max: 0 });
  });
  it("reads a single dollar figure", () => {
    expect(parsePrice("$15")).toEqual({ min: 15, max: 15 });
    expect(parsePrice("$0")).toEqual({ min: 0, max: 0 });
  });
  it("reads a hyphenated range", () => {
    expect(parsePrice("$10-$25")).toEqual({ min: 10, max: 25 });
  });
  it("reads en- and em-dash ranges with spacing", () => {
    expect(parsePrice("$10 – $25")).toEqual({ min: 10, max: 25 });
    expect(parsePrice("$10—$25")).toEqual({ min: 10, max: 25 });
  });
  it("reads decimals and thousands separators", () => {
    expect(parsePrice("$12.50")).toEqual({ min: 12.5, max: 12.5 });
    expect(parsePrice("$1,200")).toEqual({ min: 1200, max: 1200 });
  });
  it("spans every figure in a multi-tier price", () => {
    expect(parsePrice("$25 ADV / $30 DOS")).toEqual({ min: 25, max: 30 });
  });
  it("includes zero when a free tier sits alongside a paid one", () => {
    expect(parsePrice("Free-$10")).toEqual({ min: 0, max: 10 });
    expect(parsePrice("Free for members, $12 otherwise")).toEqual({ min: 0, max: 12 });
  });
  it("returns null when there is nothing to parse", () => {
    expect(parsePrice("unknown")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("Varies by session")).toBeNull();
    expect(parsePrice("Donations welcome")).toBeNull();
  });
});

describe("summarizeSelection", () => {
  const sat = "2026-06-20T14:00:00-04:00";
  const satLater = "2026-06-20T19:00:00-04:00";
  const sun = "2026-06-21T11:00:00-04:00";
  const fri = "2026-06-19T18:00:00-04:00";

  it("reports nothing for an empty selection", () => {
    expect(summarizeSelection([])).toEqual({ count: 0, daySpan: "", costRange: "" });
  });

  it("counts the picked events", () => {
    const picked = [makeEvent({ id: "a", start: sat }), makeEvent({ id: "b", start: satLater })];
    expect(summarizeSelection(picked).count).toBe(2);
  });

  it("names a single day when every pick falls on it", () => {
    const picked = [makeEvent({ id: "a", start: sat }), makeEvent({ id: "b", start: satLater })];
    expect(summarizeSelection(picked).daySpan).toBe("SAT");
  });

  it("spans first to last day across multiple days", () => {
    const picked = [
      makeEvent({ id: "a", start: fri }),
      makeEvent({ id: "b", start: sat }),
      makeEvent({ id: "c", start: sun }),
    ];
    expect(summarizeSelection(picked).daySpan).toBe("FRI–SUN");
  });

  it("spans correctly even when the input is not in chronological order", () => {
    const picked = [makeEvent({ id: "c", start: sun }), makeEvent({ id: "a", start: fri })];
    expect(summarizeSelection(picked).daySpan).toBe("FRI–SUN");
  });

  it("reports an all-free selection as Free", () => {
    const picked = [
      makeEvent({ id: "a", start: sat, price: "Free" }),
      makeEvent({ id: "b", start: sun, price: "free" }),
    ];
    expect(summarizeSelection(picked).costRange).toBe("Free");
  });

  it("collapses the range when min and max coincide", () => {
    const picked = [
      makeEvent({ id: "a", start: sat, price: "$15" }),
      makeEvent({ id: "b", start: sun, price: "$15" }),
    ];
    expect(summarizeSelection(picked).costRange).toBe("$15");
  });

  it("spans the cheapest and priciest picks", () => {
    const picked = [
      makeEvent({ id: "a", start: sat, price: "Free" }),
      makeEvent({ id: "b", start: sun, price: "$10-$25" }),
      makeEvent({ id: "c", start: fri, price: "$65" }),
    ];
    expect(summarizeSelection(picked).costRange).toBe("$0–$65");
  });

  it("suffixes + when a pick's price could not be parsed", () => {
    const picked = [
      makeEvent({ id: "a", start: sat, price: "$30" }),
      makeEvent({ id: "b", start: sun, price: "$65" }),
      makeEvent({ id: "c", start: fri, price: "unknown" }),
    ];
    expect(summarizeSelection(picked).costRange).toBe("$30–$65+");
  });

  it("suffixes + on a collapsed range and on Free too", () => {
    expect(
      summarizeSelection([
        makeEvent({ id: "a", start: sat, price: "$20" }),
        makeEvent({ id: "b", start: sun, price: "unknown" }),
      ]).costRange,
    ).toBe("$20+");
    expect(
      summarizeSelection([
        makeEvent({ id: "a", start: sat, price: "Free" }),
        makeEvent({ id: "b", start: sun, price: "unknown" }),
      ]).costRange,
    ).toBe("Free+");
  });

  it("reports no cost range when nothing parses", () => {
    const picked = [
      makeEvent({ id: "a", start: sat, price: "unknown" }),
      makeEvent({ id: "b", start: sun, price: "" }),
    ];
    expect(summarizeSelection(picked).costRange).toBe("");
  });

  it("does not mutate the input list", () => {
    const picked = [makeEvent({ id: "c", start: sun }), makeEvent({ id: "a", start: fri })];
    summarizeSelection(picked);
    expect(picked.map((e) => e.id)).toEqual(["c", "a"]);
  });
});
