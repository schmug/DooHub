import { describe, it, expect } from "vitest";
import { applyFilters, emptyFilters, isFilterActive, sortEvents } from "./filters";
import { makeEvent, RALEIGH } from "../test/factory";

const ev1 = makeEvent({ id: "1" }); // trivia, Free, $, indoor, vegan, 6/20 7pm, near origin
const ev2 = makeEvent({
  id: "2",
  name: "Indie Concert",
  category: "concerts",
  city: "Carrboro",
  price: "$25",
  budget: "$$",
  indoor_outdoor: "indoor",
  vegan: "no",
  vegetarian: "no",
  start: "2026-06-21T20:00:00-04:00",
  end: "2026-06-21T23:00:00-04:00",
  lat: 35.9132,
  lon: -79.076,
});
const ev3 = makeEvent({
  id: "3",
  name: "Farmers Market",
  category: "markets",
  city: "Durham",
  price: "Free",
  budget: "$",
  indoor_outdoor: "both",
  start: "2026-06-20T09:00:00-04:00",
  end: "2026-06-20T12:00:00-04:00",
  lat: 36.0048,
  lon: -78.8986,
});
const events = [ev1, ev2, ev3];

function ids(list: { id: string }[]): string[] {
  return list.map((e) => e.id);
}

describe("applyFilters", () => {
  it("text search matches name/category/venue", () => {
    expect(ids(applyFilters(events, { ...emptyFilters, search: "concert" }, RALEIGH))).toEqual(["2"]);
  });
  it("filters by day", () => {
    expect(ids(applyFilters(events, { ...emptyFilters, days: ["2026-06-21"] }, RALEIGH))).toEqual(["2"]);
  });
  it("filters by time of day", () => {
    expect(ids(applyFilters(events, { ...emptyFilters, timesOfDay: ["morning"] }, RALEIGH))).toEqual(["3"]);
  });
  it("freeOnly keeps only free events", () => {
    expect(ids(applyFilters(events, { ...emptyFilters, freeOnly: true }, RALEIGH)).sort()).toEqual(["1", "3"]);
  });
  it("filters by budget", () => {
    expect(ids(applyFilters(events, { ...emptyFilters, budgets: ["$$"] }, RALEIGH))).toEqual(["2"]);
  });
  it("vegan filter requires vegan=yes", () => {
    expect(ids(applyFilters(events, { ...emptyFilters, vegan: true }, RALEIGH)).sort()).toEqual(["1", "3"]);
  });
  it("'both' events match an outdoor selection", () => {
    expect(ids(applyFilters(events, { ...emptyFilters, indoorOutdoor: ["outdoor"] }, RALEIGH))).toEqual(["3"]);
  });
  it("filters by distance band", () => {
    expect(ids(applyFilters(events, { ...emptyFilters, distanceBands: ["0-5"] }, RALEIGH))).toEqual(["1"]);
  });
});

describe("sortEvents", () => {
  it("sorts by date ascending", () => {
    expect(ids(sortEvents(events, "date", RALEIGH))).toEqual(["3", "1", "2"]);
  });
  it("sorts by price (budget rank, then name)", () => {
    const sorted = sortEvents(events, "price", RALEIGH);
    expect(sorted[0]!.budget).toBe("$");
    expect(sorted[sorted.length - 1]!.id).toBe("2"); // the only $$
    expect(ids(sorted)).toEqual(["3", "1", "2"]); // Farmers < Trivia within "$"
  });
});

describe("isFilterActive", () => {
  it("is false for empty filters and true once something is set", () => {
    expect(isFilterActive(emptyFilters)).toBe(false);
    expect(isFilterActive({ ...emptyFilters, search: "x" })).toBe(true);
    expect(isFilterActive({ ...emptyFilters, freeOnly: true })).toBe(true);
  });
});
