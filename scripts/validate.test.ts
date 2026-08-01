import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEvents, validateSources, type DateWindow } from "./validate.js";
import type { EventSource, TriangleEvent } from "./lib/types.js";

function valid(over: Partial<TriangleEvent> = {}): TriangleEvent {
  return {
    id: "id-1",
    name: "Trivia Night",
    category: "trivia",
    tags: [],
    venue: "Trophy Brewing",
    address: "827 W Morgan St, Raleigh, NC 27603",
    city: "Raleigh",
    lat: 35.78,
    lon: -78.65,
    start: "2026-06-21T19:00:00-04:00",
    end: "2026-06-21T21:00:00-04:00",
    duration_min: 120,
    price: "Free",
    budget: "$",
    indoor_outdoor: "indoor",
    vegan: "yes",
    vegetarian: "yes",
    weather: null,
    image_url: "https://example.com/t.jpg",
    booking_url: "https://example.com/book",
    info_url: "https://example.com/info",
    source: "trophybrewing.com",
    first_seen: "2026-06-14T08:00:00-04:00",
    last_verified: "2026-06-20T06:00:00-04:00",
    ...over,
  };
}

test("a well-formed event produces no errors", () => {
  const { errors } = validateEvents([valid()]);
  assert.deepEqual(errors, []);
});

test("empty store warns but does not error", () => {
  const { errors, warnings } = validateEvents([]);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes("0 events")));
});

test("duplicate ids are an error", () => {
  const { errors } = validateEvents([valid({ id: "dup" }), valid({ id: "dup", name: "Other" })]);
  assert.ok(errors.some((e) => e.includes("duplicate id")));
});

test("missing required fields are errors", () => {
  const { errors } = validateEvents([valid({ name: "", venue: "" })]);
  assert.ok(errors.some((e) => e.includes('"name"')));
  assert.ok(errors.some((e) => e.includes('"venue"')));
});

test("bad enum values are errors", () => {
  const bad = valid({ budget: "cheap" as never, indoor_outdoor: "maybe" as never });
  const { errors } = validateEvents([bad]);
  assert.ok(errors.some((e) => e.includes("budget")));
  assert.ok(errors.some((e) => e.includes("indoor_outdoor")));
});

test("end before start is an error", () => {
  const { errors } = validateEvents([
    valid({ start: "2026-06-21T21:00:00-04:00", end: "2026-06-21T19:00:00-04:00" }),
  ]);
  assert.ok(errors.some((e) => e.includes("end is before start")));
});

test("start outside the window warns when a window is supplied", () => {
  const window: DateWindow = {
    start: new Date("2026-06-20T00:00:00-04:00"),
    end: new Date("2026-06-27T23:59:59-04:00"),
  };
  const { warnings } = validateEvents([valid({ start: "2026-08-01T19:00:00-04:00" })], window);
  assert.ok(warnings.some((w) => w.includes("outside the today..+7d window")));
});

test("unknown category warns but does not error", () => {
  const { errors, warnings } = validateEvents([valid({ category: "skydiving" })]);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes("outside the coverage list")));
});

test("outdoor event without weather warns", () => {
  const { warnings } = validateEvents([valid({ indoor_outdoor: "outdoor", weather: null })]);
  assert.ok(warnings.some((w) => w.includes("no weather forecast")));
});

function src(over: Partial<EventSource> = {}): EventSource {
  return {
    id: "ncma",
    name: "North Carolina Museum of Art",
    kind: "venue",
    url: "https://ncartmuseum.org/events/",
    city: "Raleigh",
    categories: ["museums"],
    ...over,
  };
}

test("validateSources accepts a well-formed registry", () => {
  const { errors } = validateSources({ schema_version: 1, sources: [src()] });
  assert.deepEqual(errors, []);
});

test("validateSources rejects duplicate source ids", () => {
  const { errors } = validateSources({
    schema_version: 1,
    sources: [src(), src({ name: "NCMA duplicate" })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /duplicate source id "ncma"/);
});

test("validateSources rejects a malformed url", () => {
  const { errors } = validateSources({ schema_version: 1, sources: [src({ url: "ncartmuseum.org" })] });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /url/);
});

test("validateSources rejects an unknown kind", () => {
  const { errors } = validateSources({
    schema_version: 1,
    sources: [src({ kind: "podcast" as never })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /kind/);
});

test("validateSources rejects a parent_venue dedup.ts does not know", () => {
  // The anti-drift check: registering a nested venue without teaching dedup.ts
  // about it must fail the build, or cross-source dupes slip through silently.
  const { errors } = validateSources({
    schema_version: 1,
    sources: [src({ id: "some-hall", name: "Some Hall", parent_venue: "Nonexistent Complex" })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /parent_venue/);
});

test("validateSources accepts a parent_venue dedup.ts does know", () => {
  const { errors } = validateSources({
    schema_version: 1,
    sources: [
      src({
        id: "meymandi-concert-hall",
        name: "Meymandi Concert Hall",
        parent_venue: "Martin Marietta Center for the Performing Arts",
      }),
    ],
  });
  assert.deepEqual(errors, []);
});
