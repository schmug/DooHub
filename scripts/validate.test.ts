import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateCoverage,
  validateEvents,
  validateSources,
  type CoverageRun,
  type DateWindow,
} from "./validate.js";
import type { EventSource, SourceCoverage, SourcesRegistry, TriangleEvent } from "./lib/types.js";

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

test("validateSources rejects a venue alias that does not resolve to the source's own venue", () => {
  // The symmetric drift check: an alias only helps if normVenue maps it onto the
  // source's canonical venue. "RBC Center" without a VENUE_ALIASES entry shares
  // 1 of 3 tokens with "Lenovo Center" — it would never merge.
  const { errors } = validateSources({
    schema_version: 1,
    sources: [src({ id: "lenovo-center", name: "Lenovo Center", venue_aliases: ["Nowhere Arena"] })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /venue_aliases/);
  assert.match(errors[0]!, /Nowhere Arena/);
});

test("validateSources accepts venue aliases dedup.ts canonicalizes onto the source", () => {
  const { errors } = validateSources({
    schema_version: 1,
    sources: [
      src({ id: "lenovo-center", name: "Lenovo Center", venue_aliases: ["PNC Arena", "RBC Center"] }),
      src({
        id: "meymandi-concert-hall",
        name: "Meymandi Concert Hall",
        parent_venue: "Martin Marietta Center for the Performing Arts",
        venue_aliases: ["Meymandi"],
      }),
    ],
  });
  assert.deepEqual(errors, []);
});

test("validateSources rejects a sibling-hall venue alias", () => {
  // Meymandi and Raleigh Memorial Auditorium are different halls inside the same
  // complex. Accepting this alias would advertise exactly the merge VENUE_PARENTS
  // exists to prevent: two distinct shows, same night, different rooms, one id.
  const { errors } = validateSources({
    schema_version: 1,
    sources: [
      src({
        id: "meymandi-concert-hall",
        name: "Meymandi Concert Hall",
        parent_venue: "Martin Marietta Center for the Performing Arts",
        venue_aliases: ["Raleigh Memorial Auditorium"],
      }),
    ],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /venue_aliases/);
  assert.match(errors[0]!, /Raleigh Memorial Auditorium/);
});

test("validateSources rejects a parent-complex venue alias declared on a hall", () => {
  // The other direction of the same mistake: collapsing the hall into the whole
  // building. normVenue must keep halls distinct, so this alias never merges.
  const { errors } = validateSources({
    schema_version: 1,
    sources: [
      src({
        id: "meymandi-concert-hall",
        name: "Meymandi Concert Hall",
        parent_venue: "Martin Marietta Center for the Performing Arts",
        venue_aliases: ["Martin Marietta Center for the Performing Arts"],
      }),
    ],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /venue_aliases/);
});

test("validateSources rejects a venue_aliases value that is not a string array", () => {
  const { errors } = validateSources({
    schema_version: 1,
    sources: [src({ venue_aliases: "NCMA" as never })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /venue_aliases/);
});

test("validateSources rejects a stringly-typed fetch_blocked", () => {
  // "false" is truthy, so a string here would silently EXEMPT the source from
  // link checking — the exact opposite of what the author meant.
  const { errors } = validateSources({
    schema_version: 1,
    sources: [src({ fetch_blocked: "false" as never })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /fetch_blocked/);
});

test("the shipped registry passes validateSources", async () => {
  const raw = await readFile(new URL("../data/sources.json", import.meta.url), "utf8");
  const { errors } = validateSources(JSON.parse(raw) as SourcesRegistry);
  assert.deepEqual(errors, []);
});

// Numbers here have to add up: sum(per_source) + off_registry_events ===
// total_events === the event count in the store the report describes.
function coverage(over: Partial<SourceCoverage> = {}): SourceCoverage {
  return {
    week: "2026-W32",
    generated_at: "2026-08-06T11:14:00-04:00",
    per_source: { ncma: 5, "lenovo-center": 0 },
    zero_hit: ["lenovo-center"],
    off_registry_sources: 11,
    off_registry_events: 62,
    total_events: 67,
    ...over,
  };
}

const registryFixture = {
  schema_version: 1,
  sources: [src(), src({ id: "lenovo-center", name: "Lenovo Center" })],
};

/** The run the fixture report claims to describe. */
const runFixture: CoverageRun = { week: "2026-W32", eventCount: 67 };

test("validateCoverage accepts a well-formed report", () => {
  const { errors, warnings } = validateCoverage(coverage(), registryFixture, runFixture);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test("validateCoverage rejects a per_source id not in the registry", () => {
  const { errors } = validateCoverage(
    coverage({ per_source: { "not-a-source": 67 }, zero_hit: [], off_registry_events: 0 }),
    registryFixture,
    runFixture,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /not-a-source/);
});

test("validateCoverage rejects a zero_hit entry that reported hits", () => {
  const { errors } = validateCoverage(coverage({ zero_hit: ["ncma"] }), registryFixture, runFixture);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /zero_hit/);
});

test("validateCoverage warns when off-registry share falls below the 40% quota", () => {
  const { errors, warnings } = validateCoverage(
    coverage({ per_source: { ncma: 57, "lenovo-center": 0 }, off_registry_events: 10 }),
    registryFixture,
    runFixture,
  );
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /off-registry share/);
});

test("validateCoverage rejects a report whose week is not this run's week", () => {
  // The stale-file case: the report is committed, so a run that forgot to
  // rewrite it revalidates last week's telemetry and passes clean.
  const { errors } = validateCoverage(coverage({ week: "2026-W31" }), registryFixture, runFixture);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /week/);
});

test("validateCoverage rejects total_events that disagrees with the store", () => {
  const { errors } = validateCoverage(coverage(), registryFixture, { week: "2026-W32", eventCount: 141 });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /total_events/);
});

test("validateCoverage rejects counts that do not add up to total_events", () => {
  const { errors } = validateCoverage(coverage({ off_registry_events: 40 }), registryFixture, runFixture);
  assert.ok(errors.some((e) => /do not add up|per_source/.test(e)), errors.join("; "));
});

test("validateCoverage rejects a non-numeric per_source count", () => {
  const { errors } = validateCoverage(
    coverage({ per_source: { ncma: "5" as never, "lenovo-center": 0 } }),
    registryFixture,
    runFixture,
  );
  assert.ok(errors.some((e) => /ncma/.test(e)), errors.join("; "));
});

test("validateCoverage warns — does not error — when a registry id is missing from per_source", () => {
  const { errors, warnings } = validateCoverage(
    coverage({ per_source: { ncma: 5 }, zero_hit: [] }),
    registryFixture,
    runFixture,
  );
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /lenovo-center/);
});

test("validateCoverage warns when fewer than 8 distinct off-registry sources contributed", () => {
  const { errors, warnings } = validateCoverage(
    coverage({ off_registry_sources: 3 }),
    registryFixture,
    runFixture,
  );
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /off-registry source/);
});

test("validateCoverage rejects off-registry events attributed to zero sources", () => {
  const { errors } = validateCoverage(
    coverage({ off_registry_sources: 0 }),
    registryFixture,
    runFixture,
  );
  assert.ok(errors.some((e) => /off_registry_sources/.test(e)), errors.join("; "));
});
