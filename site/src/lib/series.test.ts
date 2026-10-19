import { describe, it, expect } from "vitest";
import { collapseSeries, seriesKey, venueCount } from "./series";
import { makeEvent } from "../test/factory";

describe("seriesKey", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(seriesKey("Pizza & Pints Special!")).toBe(seriesKey("pizza  and pints special"));
    expect(seriesKey("Family Storytime")).toBe("family storytime");
  });
});

describe("collapseSeries", () => {
  const a1 = makeEvent({ id: "a1", name: "Family Storytime", venue: "Main Library" });
  const b = makeEvent({ id: "b", name: "Indie Concert" });
  const a2 = makeEvent({ id: "a2", name: "family storytime", venue: "North Regional Library" });
  const a3 = makeEvent({ id: "a3", name: "Family Storytime", venue: "Main Library", city: "Durham" });

  it("stacks repeats at the first occurrence and keeps list order", () => {
    const items = collapseSeries([a1, b, a2, a3]);
    expect(items.map((i) => i.lead.id)).toEqual(["a1", "b"]);
    expect(items[0]!.events.map((e) => e.id)).toEqual(["a1", "a2", "a3"]);
    expect(items[1]!.events).toHaveLength(1);
  });

  it("never stacks across a scope boundary", () => {
    const items = collapseSeries([a1, a2, a3], (e) => e.city);
    expect(items.map((i) => i.events.map((e) => e.id))).toEqual([["a1", "a2"], ["a3"]]);
  });

  it("does not stack events with blank names", () => {
    const x = makeEvent({ id: "x", name: "!!" });
    const y = makeEvent({ id: "y", name: "" });
    expect(collapseSeries([x, y])).toHaveLength(2);
  });

  it("counts venues by venue and city", () => {
    expect(venueCount([a1, a2, a3])).toBe(3);
    expect(venueCount([a1, a1])).toBe(1);
  });
});
