import { test } from "node:test";
import assert from "node:assert/strict";
import { computeId, normName, normVenue, isSameOccurrence, jaccard, tokenSet, venueParent } from "./lib/dedup.js";
import type { TriangleEvent } from "./lib/types.js";

function ev(over: Partial<TriangleEvent>): TriangleEvent {
  return {
    id: "",
    name: "Art in the Evening",
    category: "museums",
    tags: [],
    venue: "NC Museum of Art",
    address: "",
    city: "Raleigh",
    lat: null,
    lon: null,
    start: "2026-06-20T18:00:00-04:00",
    end: "2026-06-20T21:00:00-04:00",
    duration_min: 180,
    price: "Free",
    budget: "$",
    indoor_outdoor: "outdoor",
    vegan: "unknown",
    vegetarian: "unknown",
    weather: null,
    image_url: "",
    booking_url: "",
    info_url: "",
    source: "",
    first_seen: "",
    last_verified: "",
    ...over,
  };
}

test("normName is order-insensitive and drops filler tokens", () => {
  assert.equal(normName("Jazz on the Lawn"), normName("Lawn Jazz")); // "on"/"the" dropped, order ignored
  assert.equal(normName("Blues & BBQ Festival"), "bbq blues festival");
});

test("normVenue canonicalizes known aliases and strips leading 'the'", () => {
  assert.equal(normVenue("NCMA"), "nc museum of art");
  assert.equal(normVenue("North Carolina Museum of Art"), "nc museum of art");
  assert.equal(normVenue("The Lincoln Theatre"), "lincoln theatre");
  assert.equal(normVenue("Durham Performing Arts Center"), "dpac");
});

test("computeId is stable across venue-alias + time-of-day variation (same name tokens)", () => {
  // Same listing, two sources: venue spelled differently, start 90 min apart, same date.
  const a = computeId({ name: "Art in the Evening", start: "2026-06-20T18:00:00-04:00", venue: "NCMA", city: "Raleigh" });
  const b = computeId({ name: "Art in the Evening", start: "2026-06-20T19:30:00-04:00", venue: "North Carolina Museum of Art", city: "Raleigh" });
  assert.equal(a, b);
});

test("the harder cross-source title case is collapsed by isSameOccurrence, not computeId", () => {
  // Different surface titles -> different ids (that's fine)...
  const idA = computeId({ name: "NCMA: Art in the Evening", start: "2026-06-20T18:00:00-04:00", venue: "NCMA", city: "Raleigh" });
  const idB = computeId({ name: "Art in the Evening @ NC Museum of Art", start: "2026-06-20T19:00:00-04:00", venue: "North Carolina Museum of Art", city: "Raleigh" });
  assert.notEqual(idA, idB);
  // ...but the merge step recognizes them as the same occurrence (covered below by isSameOccurrence).
});

test("computeId keeps distinct occurrences of a recurring series separate", () => {
  const week1 = computeId({ name: "Trivia Night", start: "2026-06-21T19:00:00-04:00", venue: "Trophy Brewing", city: "Raleigh" });
  const week2 = computeId({ name: "Trivia Night", start: "2026-06-28T19:00:00-04:00", venue: "Trophy Brewing", city: "Raleigh" });
  assert.notEqual(week1, week2);
});

test("computeId is a 12-char hex hash", () => {
  const id = computeId({ name: "X", start: "2026-06-20T18:00:00-04:00", venue: "Y", city: "Raleigh" });
  assert.match(id, /^[0-9a-f]{12}$/);
});

test("isSameOccurrence collapses cross-source duplicates within 90 min", () => {
  const a = ev({ name: "NCMA: Art in the Evening", venue: "NCMA", start: "2026-06-20T18:00:00-04:00" });
  const b = ev({ name: "Art in the Evening", venue: "North Carolina Museum of Art", start: "2026-06-20T19:00:00-04:00" });
  assert.equal(isSameOccurrence(a, b), true);
});

test("isSameOccurrence rejects same title at a different venue", () => {
  const a = ev({ name: "Trivia Night", venue: "Trophy Brewing", start: "2026-06-20T19:00:00-04:00" });
  const b = ev({ name: "Trivia Night", venue: "Lynnwood Brewing", start: "2026-06-20T19:00:00-04:00" });
  assert.equal(isSameOccurrence(a, b), false);
});

test("isSameOccurrence rejects same venue more than 90 min apart", () => {
  const a = ev({ start: "2026-06-20T14:00:00-04:00" });
  const b = ev({ start: "2026-06-20T18:00:00-04:00" });
  assert.equal(isSameOccurrence(a, b), false);
});

test("jaccard basics", () => {
  assert.equal(jaccard(tokenSet("art evening"), tokenSet("art evening")), 1);
  assert.equal(jaccard(tokenSet("foo"), tokenSet("bar")), 0);
});

test("normVenue collapses the PNC Arena -> Lenovo Center rename", () => {
  assert.equal(normVenue("PNC Arena"), "lenovo center");
  assert.equal(normVenue("Lenovo Center"), "lenovo center");
});

test("normVenue collapses the Duke Energy Center -> Martin Marietta Center rename", () => {
  assert.equal(
    normVenue("Duke Energy Center for the Performing Arts"),
    "martin marietta center for the performing arts",
  );
  assert.equal(
    normVenue("Martin Marietta Center for the Performing Arts"),
    "martin marietta center for the performing arts",
  );
});

test("normVenue collapses Quail Ridge Books naming variants", () => {
  assert.equal(normVenue("Quail Ridge Bookstore"), "quail ridge books");
  assert.equal(normVenue("Quail Ridge Books"), "quail ridge books");
});

test("computeId matches for one show listed under both arena names", () => {
  const a = ev({ name: "Carolina Hurricanes vs Bruins", venue: "PNC Arena", city: "Raleigh" });
  const b = ev({ name: "Carolina Hurricanes vs Bruins", venue: "Lenovo Center", city: "Raleigh" });
  assert.equal(computeId(a), computeId(b));
});

test("unaliased venue ids are unchanged by the new alias entries", () => {
  // Regression guard: published .ics UIDs are these ids. A venue the alias table
  // does not name must hash exactly as it did before this change.
  const e = ev({ name: "Trivia Night", venue: "Trophy Brewing", city: "Raleigh" });
  assert.equal(computeId(e), "b9e329f6fecb");
});

test("venueParent resolves a hall to its complex and returns null otherwise", () => {
  assert.equal(
    venueParent("Meymandi Concert Hall"),
    "martin marietta center for the performing arts",
  );
  assert.equal(venueParent("Cat's Cradle"), null);
});

test("isSameOccurrence merges one concert listed at the hall and at the complex", () => {
  const hall = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Meymandi Concert Hall",
    start: "2026-08-14T20:00:00-04:00",
  });
  const complex = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Martin Marietta Center for the Performing Arts",
    start: "2026-08-14T20:00:00-04:00",
  });
  assert.equal(isSameOccurrence(hall, complex), true);
});

test("isSameOccurrence keeps different halls in one complex separate", () => {
  // The regression an alias-only fix would have introduced: two DIFFERENT shows
  // in two different halls of the same building on the same night.
  const meymandi = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Meymandi Concert Hall",
    start: "2026-08-14T20:00:00-04:00",
  });
  const memorial = ev({
    name: "Hadestown",
    venue: "Raleigh Memorial Auditorium",
    start: "2026-08-14T20:00:00-04:00",
  });
  assert.equal(isSameOccurrence(meymandi, memorial), false);
});

test("parent matching still respects the +/-90 minute window", () => {
  const hall = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Meymandi Concert Hall",
    start: "2026-08-14T14:00:00-04:00",
  });
  const complex = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Martin Marietta Center for the Performing Arts",
    start: "2026-08-14T20:00:00-04:00",
  });
  assert.equal(isSameOccurrence(hall, complex), false);
});

test("parent matching does not collapse ids", () => {
  // computeId must stay hall-specific — only isSameOccurrence knows about parents.
  const hall = ev({ name: "Recital", venue: "Meymandi Concert Hall" });
  const complex = ev({ name: "Recital", venue: "Martin Marietta Center for the Performing Arts" });
  assert.notEqual(computeId(hall), computeId(complex));
});

test("venueParent regression: all VENUE_PARENTS entries resolve correctly", () => {
  // Each hall must resolve to its complex. Tests both punctuated and unpunctuated
  // variants where they occur (A.J. Fletcher has periods in the official name).
  assert.equal(
    venueParent("Meymandi Concert Hall"),
    "martin marietta center for the performing arts",
  );
  assert.equal(
    venueParent("Raleigh Memorial Auditorium"),
    "martin marietta center for the performing arts",
  );
  assert.equal(
    venueParent("A.J. Fletcher Opera Theater"),
    "martin marietta center for the performing arts",
  );
  assert.equal(
    venueParent("AJ Fletcher Opera Theater"),
    "martin marietta center for the performing arts",
  );
  assert.equal(
    venueParent("Kennedy Theatre"),
    "martin marietta center for the performing arts",
  );
});
