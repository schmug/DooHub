import { describe, it, expect } from "vitest";
import { endMs, isOver } from "./past";
import { makeEvent } from "../test/factory";

const at = (iso: string) => Date.parse(iso);

describe("isOver", () => {
  it("uses end when present", () => {
    const ev = makeEvent({ start: "2026-06-20T19:00:00-04:00", end: "2026-06-20T21:00:00-04:00" });
    expect(isOver(ev, at("2026-06-20T20:59:00-04:00"))).toBe(false);
    expect(isOver(ev, at("2026-06-20T21:00:00-04:00"))).toBe(true);
  });

  it("keeps a running multi-day festival", () => {
    const ev = makeEvent({ start: "2026-06-18T10:00:00-04:00", end: "2026-06-21T22:00:00-04:00" });
    expect(isOver(ev, at("2026-06-20T12:00:00-04:00"))).toBe(false);
  });

  it("falls back to duration_min, then two hours", () => {
    const withDur = makeEvent({ start: "2026-06-20T19:00:00-04:00", end: "", duration_min: 30 });
    expect(endMs(withDur)).toBe(at("2026-06-20T19:30:00-04:00"));
    const bare = makeEvent({ start: "2026-06-20T19:00:00-04:00", end: "", duration_min: 0 });
    expect(endMs(bare)).toBe(at("2026-06-20T21:00:00-04:00"));
  });

  it("ignores an end that isn't after the start", () => {
    const ev = makeEvent({ start: "2026-06-20T19:00:00-04:00", end: "2026-06-20T19:00:00-04:00", duration_min: null });
    expect(endMs(ev)).toBe(at("2026-06-20T21:00:00-04:00"));
  });

  it("keeps all-day and time-TBD events until the NY day ends", () => {
    const allDay = makeEvent({ start: "2026-06-20T00:00:00-04:00", end: "" });
    expect(isOver(allDay, at("2026-06-20T23:59:00-04:00"))).toBe(false);
    expect(isOver(allDay, at("2026-06-21T00:00:00-04:00"))).toBe(true);
    const tbd = makeEvent({ start: "2026-06-20T10:00:00-04:00", end: "", tags: ["time-tbd"] });
    expect(isOver(tbd, at("2026-06-20T18:00:00-04:00"))).toBe(false);
    expect(endMs(tbd)).toBe(at("2026-06-21T00:00:00-04:00"));
  });
});
