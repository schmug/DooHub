import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, escapeText, foldLine, toLocalStamp, eventUid } from "./lib/ics.js";
import type { TriangleEvent } from "./lib/types.js";

function sampleEvent(over: Partial<TriangleEvent> = {}): TriangleEvent {
  return {
    id: "abc123def456",
    name: "Art in the Evening",
    category: "museums",
    tags: ["outdoor", "family-friendly"],
    venue: "NC Museum of Art",
    address: "2110 Blue Ridge Rd, Raleigh, NC 27607",
    city: "Raleigh",
    lat: 35.8101,
    lon: -78.7028,
    start: "2026-06-20T18:00:00-04:00",
    end: "2026-06-20T21:00:00-04:00",
    duration_min: 180,
    price: "Free",
    budget: "$",
    indoor_outdoor: "outdoor",
    vegan: "yes",
    vegetarian: "yes",
    weather: { summary: "Clear", temp_f: 72 },
    image_url: "https://example.com/art.jpg",
    booking_url: "https://example.com/book",
    info_url: "https://example.com/info",
    source: "ncartmuseum.org",
    first_seen: "2026-06-13T08:00:00-04:00",
    last_verified: "2026-06-20T06:00:00-04:00",
    description: "Live music on the museum lawn.",
    ...over,
  };
}

const FIXED_NOW = new Date("2026-06-20T10:00:00Z");

test("buildIcs wraps events in a VCALENDAR with a VTIMEZONE", () => {
  const ics = buildIcs([sampleEvent()], { now: FIXED_NOW });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:America\/New_York/);
  assert.match(ics, /VERSION:2\.0/);
});

test("uses CRLF line endings throughout", () => {
  const ics = buildIcs([sampleEvent()], { now: FIXED_NOW });
  const bareLf = ics.replace(/\r\n/g, "");
  assert.ok(!bareLf.includes("\n"), "found a bare LF not part of CRLF");
});

test("emits a stable domain-qualified UID equal to the event id", () => {
  const ics = buildIcs([sampleEvent()], { now: FIXED_NOW });
  assert.equal(eventUid("abc123def456"), "abc123def456@triangle-weekend.cortech.online");
  assert.match(ics, /UID:abc123def456@triangle-weekend\.cortech\.online/);
});

test("DTSTART/DTEND carry TZID and NY wall-clock time", () => {
  const ics = buildIcs([sampleEvent()], { now: FIXED_NOW });
  assert.match(ics, /DTSTART;TZID=America\/New_York:20260620T180000/);
  assert.match(ics, /DTEND;TZID=America\/New_York:20260620T210000/);
});

test("toLocalStamp converts any offset to America/New_York wall time", () => {
  // 18:00Z in June = 14:00 EDT
  assert.equal(toLocalStamp("2026-06-20T18:00:00Z"), "20260620T140000");
  // already EDT
  assert.equal(toLocalStamp("2026-06-20T14:00:00-04:00"), "20260620T140000");
  // January = EST (-5)
  assert.equal(toLocalStamp("2026-01-15T18:00:00Z"), "20260115T130000");
});

test("GEO + CATEGORIES + URL are emitted", () => {
  const ics = buildIcs([sampleEvent()], { now: FIXED_NOW });
  assert.match(ics, /GEO:35\.8101;-78\.7028/);
  assert.match(ics, /CATEGORIES:museums/);
  assert.match(ics, /URL:https:\/\/example\.com\/book/);
});

test("escapeText escapes commas, semicolons, backslashes, and newlines", () => {
  assert.equal(escapeText("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
});

test("SUMMARY with a comma is escaped in output", () => {
  const ics = buildIcs([sampleEvent({ name: "Wine, Cheese & Jazz" })], { now: FIXED_NOW });
  assert.match(ics, /SUMMARY:Wine\\, Cheese & Jazz/);
});

test("foldLine folds long lines at <=75 octets with a leading space", () => {
  const long = "DESCRIPTION:" + "x".repeat(200);
  const folded = foldLine(long);
  const lines = folded.split("\r\n");
  assert.ok(lines.length > 1, "expected the line to fold");
  for (const l of lines) {
    assert.ok(Buffer.byteLength(l, "utf8") <= 75, `line too long: ${l.length}`);
  }
  for (let i = 1; i < lines.length; i++) {
    assert.equal(lines[i]!.startsWith(" "), true, "continuation must start with a space");
  }
});

test("empty event list still produces a valid calendar", () => {
  const ics = buildIcs([], { now: FIXED_NOW });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR/);
  assert.ok(!ics.includes("BEGIN:VEVENT"));
});
