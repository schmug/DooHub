import { describe, it, expect } from "vitest";
import { buildIcs } from "./ics";
import { makeEvent } from "../test/factory";

describe("buildIcs (client)", () => {
  it("wraps events in a VCALENDAR with a VEVENT", () => {
    const ics = buildIcs([makeEvent()]);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toMatch(/\r\nEND:VCALENDAR\r\n$/);
    expect(ics).toContain("BEGIN:VEVENT");
  });

  it("emits the same stable UID format as the server build", () => {
    const ics = buildIcs([makeEvent({ id: "e1" })]);
    expect(ics).toMatch(/UID:e1@triangle-weekend\.cortech\.online/);
  });

  it("writes DTSTART with TZID and NY wall-clock", () => {
    const ics = buildIcs([makeEvent({ start: "2026-06-20T19:00:00-04:00" })]);
    expect(ics).toMatch(/DTSTART;TZID=America\/New_York:20260620T190000/);
  });

  it("uses CRLF line endings and escapes commas", () => {
    const ics = buildIcs([makeEvent({ name: "Wine, Cheese & Jazz" })]);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    expect(ics).toMatch(/SUMMARY:Wine\\, Cheese & Jazz/);
  });
});
