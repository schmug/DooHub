import { describe, it, expect } from "vitest";
import { makeEvent } from "../test/factory";
import { boundsFor, boundsKey, mergeForMap } from "./mapMarkers";

describe("mergeForMap", () => {
  const a = makeEvent({ id: "a" });
  const b = makeEvent({ id: "b" });
  const c = makeEvent({ id: "c" });

  it("returns the visible events when nothing is picked", () => {
    expect(mergeForMap([a, b], []).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("does not duplicate a pick that is already visible", () => {
    expect(mergeForMap([a, b], [b]).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("appends a pick the active filters have hidden", () => {
    // The selection is deliberately filter-independent, so narrowing a filter
    // must not drop a picked event's pin off the map.
    expect(mergeForMap([a], [c]).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("keeps visible order first, then the missing picks in their own order", () => {
    expect(mergeForMap([a], [c, b]).map((e) => e.id)).toEqual(["a", "c", "b"]);
  });

  it("returns the picks alone when nothing is visible", () => {
    expect(mergeForMap([], [a, b]).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("dedupes by id even when the two lists hold different objects", () => {
    const restated = makeEvent({ id: "a", name: "Same event, other listing" });
    const merged = mergeForMap([a], [restated]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe(a.name);
  });

  it("does not mutate either input", () => {
    const visible = [a];
    const picked = [c];
    mergeForMap(visible, picked);
    expect(visible.map((e) => e.id)).toEqual(["a"]);
    expect(picked.map((e) => e.id)).toEqual(["c"]);
  });
});

describe("boundsFor", () => {
  it("returns null for an empty list", () => {
    expect(boundsFor([])).toBeNull();
    });

  it("returns null when no event has coordinates", () => {
    expect(boundsFor([makeEvent({ id: "a", lat: null, lon: null })])).toBeNull();
  });

  it("returns a degenerate box for a single located event", () => {
    const one = makeEvent({ id: "a", lat: 35.78, lon: -78.64 });
    expect(boundsFor([one])).toEqual([
      [35.78, -78.64],
      [35.78, -78.64],
    ]);
  });

  it("spans south-west to north-east across events", () => {
    const events = [
      makeEvent({ id: "a", lat: 35.78, lon: -78.64 }),
      makeEvent({ id: "b", lat: 36.0, lon: -79.06 }),
      makeEvent({ id: "c", lat: 35.7, lon: -78.5 }),
    ];
    expect(boundsFor(events)).toEqual([
      [35.7, -79.06],
      [36.0, -78.5],
    ]);
  });

  it("ignores events missing coordinates when others have them", () => {
    const events = [
      makeEvent({ id: "a", lat: 35.78, lon: -78.64 }),
      makeEvent({ id: "b", lat: null, lon: null }),
      makeEvent({ id: "c", lat: 36.0, lon: -79.06 }),
    ];
    expect(boundsFor(events)).toEqual([
      [35.78, -79.06],
      [36.0, -78.64],
    ]);
  });

  it("ignores an event with only one of the two coordinates", () => {
    const events = [
      makeEvent({ id: "a", lat: 35.78, lon: -78.64 }),
      makeEvent({ id: "b", lat: 40.0, lon: null }),
    ];
    expect(boundsFor(events)).toEqual([
      [35.78, -78.64],
      [35.78, -78.64],
    ]);
  });
});

describe("boundsKey", () => {
  it("gives equal-valued boxes the same key", () => {
    const one = boundsFor([makeEvent({ id: "a", lat: 35.78, lon: -78.64 })]);
    const two = boundsFor([makeEvent({ id: "b", lat: 35.78, lon: -78.64 })]);
    expect(one).not.toBe(two);
    expect(boundsKey(one)).toBe(boundsKey(two));
  });

  it("gives different boxes different keys", () => {
    const one = boundsFor([makeEvent({ id: "a", lat: 35.78, lon: -78.64 })]);
    const two = boundsFor([makeEvent({ id: "b", lat: 36.0, lon: -79.06 })]);
    expect(boundsKey(one)).not.toBe(boundsKey(two));
  });

  it("has a stable key for no bounds at all", () => {
    expect(boundsKey(null)).toBe(boundsKey(null));
    expect(boundsKey(null)).not.toBe(boundsKey([[0, 0], [0, 0]]));
  });
});
