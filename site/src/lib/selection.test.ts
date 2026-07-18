import { describe, it, expect } from "vitest";
import { makeEvent } from "../test/factory";
import { parseSelection, pruneSelection, selectedEvents } from "./selection";

describe("parseSelection", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(parseSelection(null)).toEqual([]);
    expect(parseSelection("")).toEqual([]);
  });
  it("returns an empty list for corrupt JSON", () => {
    expect(parseSelection("{not json")).toEqual([]);
  });
  it("returns an empty list for valid JSON that isn't an array", () => {
    expect(parseSelection('{"a":1}')).toEqual([]);
    expect(parseSelection('"e1"')).toEqual([]);
  });
  it("round-trips a stored id list", () => {
    expect(parseSelection(JSON.stringify(["e1", "e2"]))).toEqual(["e1", "e2"]);
  });
  it("drops non-string members of a stored array", () => {
    expect(parseSelection('["e1",7,null,"e2"]')).toEqual(["e1", "e2"]);
  });
});

describe("pruneSelection", () => {
  const events = [makeEvent({ id: "e1" }), makeEvent({ id: "e2" })];

  it("keeps ids that still exist in the event set", () => {
    expect(pruneSelection(["e1", "e2"], events)).toEqual(["e1", "e2"]);
  });
  it("drops ids the weekly refresh removed", () => {
    expect(pruneSelection(["e1", "gone", "e2"], events)).toEqual(["e1", "e2"]);
  });
  it("returns an empty list when no id survives", () => {
    expect(pruneSelection(["gone"], events)).toEqual([]);
  });
});

describe("selectedEvents", () => {
  const early = makeEvent({ id: "early", start: "2026-06-20T09:00:00-04:00" });
  const mid = makeEvent({ id: "mid", start: "2026-06-20T14:00:00-04:00" });
  const late = makeEvent({ id: "late", start: "2026-06-21T19:00:00-04:00" });
  const events = [late, early, mid];

  it("returns the picked events in chronological order", () => {
    expect(selectedEvents(events, ["late", "early", "mid"]).map((e) => e.id)).toEqual(["early", "mid", "late"]);
  });
  it("ignores ids with no matching event", () => {
    expect(selectedEvents(events, ["mid", "gone"]).map((e) => e.id)).toEqual(["mid"]);
  });
  it("returns an empty list when nothing is picked", () => {
    expect(selectedEvents(events, [])).toEqual([]);
  });
  it("does not mutate the input event list", () => {
    const input = [late, early, mid];
    selectedEvents(input, ["early", "late"]);
    expect(input.map((e) => e.id)).toEqual(["late", "early", "mid"]);
  });
});
