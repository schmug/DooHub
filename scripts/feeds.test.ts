import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  icsToEasternIso,
  ingestFeed,
  isInMetro,
  looksLikeSyndicationFeed,
  parseIcsFeed,
  parseLocalistFeed,
  unescapeIcsText,
  unfoldIcsLines,
} from "./lib/feeds.js";
import { computeId } from "./lib/dedup.js";
import type { EventSource } from "./lib/types.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => readFile(join(FIXTURES, name), "utf8");

// The fixtures were captured 2026-08-23; every window below is anchored there so
// the tests stay deterministic as the real clock moves on.
const NOW = "2026-08-23T06:00:00-04:00";
const WINDOW = { start: "2026-08-23T00:00:00-04:00", end: "2026-08-30T23:59:59-04:00" };

function source(over: Partial<EventSource> = {}): EventSource {
  return {
    id: "unc-athletics",
    name: "UNC Athletics",
    kind: "venue",
    url: "https://goheels.com/calendar",
    city: "Chapel Hill",
    categories: ["sports"],
    ingest: {
      mode: "feed",
      feed_url: "https://goheels.com/calendar.ashx/calendar.ics",
      feed_type: "ics",
      feed_scope: "traveling",
    },
    ...over,
  };
}

const DNCR = source({
  id: "nc-historic-sites",
  name: "NC DNCR Events",
  kind: "hub",
  url: "https://events.dncr.nc.gov/",
  city: "Raleigh",
  categories: ["historic sites", "museums", "tours"],
  ingest: {
    mode: "feed",
    feed_url: "https://events.dncr.nc.gov/api/2/events?days=7&pp=100",
    feed_type: "localist",
  },
});

const DUKE = source({
  id: "duke-calendar",
  name: "Duke University",
  kind: "hub",
  url: "https://calendar.duke.edu/",
  city: "Durham",
  categories: ["classes", "concerts"],
  ingest: { mode: "feed", feed_url: "https://calendar.duke.edu/index.ics", feed_type: "ics" },
});

// --- ICS reader ------------------------------------------------------------

test("unfoldIcsLines rejoins RFC 5545 continuation lines", () => {
  const lines = unfoldIcsLines("SUMMARY:Duke Chap\r\n el Choir\r\nLOCATION:Duke\r\n\tChapel\r\n");
  assert.deepEqual(lines, ["SUMMARY:Duke Chapel Choir", "LOCATION:DukeChapel"]);
});

test("unescapeIcsText decodes RFC 5545 TEXT escapes", () => {
  assert.equal(unescapeIcsText("Chapel Hill\\, N.C.\\; Kenan"), "Chapel Hill, N.C.; Kenan");
  assert.equal(unescapeIcsText("line one\\nline two"), "line one\nline two");
  assert.equal(unescapeIcsText("back\\\\slash"), "back\\slash");
});

test("icsToEasternIso converts UTC stamps to an America/New_York offset", () => {
  assert.equal(icsToEasternIso("20260823T170000Z"), "2026-08-23T13:00:00-04:00");
});

test("icsToEasternIso reads a TZID wall time in its own zone", () => {
  assert.equal(
    icsToEasternIso("20260823T091500", { TZID: "America/New_York" }),
    "2026-08-23T09:15:00-04:00",
  );
});

test("icsToEasternIso honors the winter offset", () => {
  assert.equal(
    icsToEasternIso("20260115T120000", { TZID: "America/New_York" }),
    "2026-01-15T12:00:00-05:00",
  );
});

test("icsToEasternIso maps a VALUE=DATE all-day stamp to local midnight", () => {
  assert.equal(icsToEasternIso("20260823", { VALUE: "DATE" }), "2026-08-23T00:00:00-04:00");
});

test("icsToEasternIso returns null for an unparseable stamp", () => {
  assert.equal(icsToEasternIso("not-a-date"), null);
  assert.equal(icsToEasternIso(""), null);
});

test("parseIcsFeed reads every VEVENT in the goheels feed", async () => {
  const items = parseIcsFeed(await fixture("goheels.ics"));
  assert.equal(items.length, 7);
  const first = items[0]!;
  assert.equal(first.title, "[L] North Carolina Women's Soccer vs Michigan State");
  assert.equal(first.start, "2026-08-23T13:00:00-04:00");
  assert.equal(first.end, "2026-08-23T15:00:00-04:00");
  assert.equal(first.location, "Chapel Hill, N.C., Dorrance Field at Play2Dream Legacy Stadium");
});

test("parseIcsFeed decodes &amp; in a URL property", async () => {
  const items = parseIcsFeed(await fixture("goheels.ics"));
  assert.equal(items[0]!.url, "https://admin.goheels.com/calendar.aspx?game_id=26998&sport_id=22");
});

test("parseIcsFeed reads folded LOCATION and DURATION from the Duke feed", async () => {
  const items = parseIcsFeed(await fixture("duke-calendar.ics"));
  assert.equal(items.length, 4);
  const rehearsal = items.find((i) => i.title === "Duke Chapel Choir Open Rehearsal")!;
  assert.equal(rehearsal.location, "Duke Chapel");
  assert.equal(rehearsal.start, "2026-08-23T09:15:00-04:00");
  assert.equal(rehearsal.end, "2026-08-23T10:15:00-04:00"); // DURATION:PT1H, no DTEND
});

test("parseIcsFeed treats a placeholder LOCATION as no location", async () => {
  const items = parseIcsFeed(await fixture("duke-calendar.ics"));
  const market = items.find((i) => i.title === "Duke Farmers Market")!;
  assert.equal(market.location, ""); // the feed literally says "None"
});

test("parseIcsFeed drops a VEVENT with no DTSTART", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "SUMMARY:Undated announcement",
    "LOCATION:Raleigh\\, N.C.",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Real event",
    "DTSTART:20260824T230000Z",
    "LOCATION:Raleigh\\, N.C.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const items = parseIcsFeed(ics);
  assert.equal(items.length, 2);
  assert.equal(items[0]!.start, null); // kept as an item; ingestFeed is what drops it
  assert.equal(items[1]!.start, "2026-08-24T19:00:00-04:00");
});

// --- Localist reader -------------------------------------------------------

test("parseLocalistFeed reads title, instance times, venue and geo", async () => {
  const items = parseLocalistFeed(await fixture("dncr-localist.json"));
  assert.equal(items.length, 6);
  const waterbugs = items.find((i) => i.title === "Wacky Waterbugs")!;
  assert.equal(waterbugs.start, "2026-08-24T10:00:00-04:00");
  assert.equal(waterbugs.end, "2026-08-24T11:30:00-04:00");
  assert.equal(waterbugs.location, "Eno River State Park - Fews Ford Access & Visitor Center");
  assert.equal(waterbugs.city, "Durham");
  assert.equal(waterbugs.lat, 36.078519);
  assert.equal(waterbugs.lon, -79.005129);
});

test("parseLocalistFeed prefers an explicit ticket_cost over the free flag", async () => {
  const items = parseLocalistFeed(await fixture("dncr-localist.json"));
  assert.equal(items.find((i) => i.title === "Spy Training 101: Decode a Secret Message")!.price, "Free");
  assert.match(items.find((i) => i.title === "Staying Alive")!.price, /^Museum Members Free, Adult \$18/);
  // No cost string and free=false — a FeedItem carries "" for absent, and
  // ingestFeed is what turns that into the schema's "unknown".
  assert.equal(
    items.find((i) => i.title === "Elk Knob State Park: Curious Minds Adventure Scavenger Hunt")!.price,
    "",
  );
});

test("parseLocalistFeed falls back to the localist_url when the event url is empty", async () => {
  const items = parseLocalistFeed(await fixture("dncr-localist.json"));
  const fire = items.find((i) => i.title === "Fire on the Mountain")!;
  assert.equal(fire.url, "https://events.dncr.nc.gov/event/fire-on-the-mountain");
  assert.equal(fire.booking_url, "https://www.chimneyrockpark.com/info-and-tickets/");
});

test("parseLocalistFeed drops an event with no instance start", () => {
  const raw = JSON.stringify({
    events: [
      { event: { id: 1, title: "No instances", event_instances: [], location_name: "Raleigh" } },
      {
        event: {
          id: 2,
          title: "Has one",
          location_name: "Raleigh",
          event_instances: [{ event_instance: { start: "2026-08-24T19:00:00-04:00", end: null } }],
        },
      },
    ],
  });
  const items = parseLocalistFeed(raw);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, "Has one");
});

test("parseLocalistFeed emits one item per instance of a recurring event", () => {
  const raw = JSON.stringify({
    events: [
      {
        event: {
          id: 3,
          title: "Trivia Night",
          location_name: "Raleigh",
          event_instances: [
            { event_instance: { start: "2026-08-24T19:00:00-04:00", end: null } },
            { event_instance: { start: "2026-08-31T19:00:00-04:00", end: null } },
          ],
        },
      },
    ],
  });
  assert.deepEqual(
    parseLocalistFeed(raw).map((i) => i.start),
    ["2026-08-24T19:00:00-04:00", "2026-08-31T19:00:00-04:00"],
  );
});

test("parseLocalistFeed throws on a response that is not JSON", () => {
  assert.throws(() => parseLocalistFeed("<html>403 Forbidden</html>"), /localist/i);
});

// --- Radius filter ---------------------------------------------------------

test("isInMetro trusts coordinates over anything else", () => {
  // Elk Knob State Park, Todd NC — ~180 mi from Raleigh, but the source is a
  // Triangle-declared hub, so only the coordinates keep it out.
  assert.equal(
    isInMetro({ lat: 36.333462, lon: -81.696432, city: "Todd", location: "Elk Knob State Park" }, "Raleigh"),
    false,
  );
  assert.equal(
    isInMetro({ lat: 35.782156, lon: -78.639336, city: "Raleigh", location: "NCMNS" }, "Raleigh"),
    true,
  );
});

test("isInMetro accepts a Triangle ring town and rejects an in-state outsider", () => {
  assert.equal(isInMetro({ lat: null, lon: null, city: "Hillsborough", location: "" }, "Raleigh"), true);
  assert.equal(isInMetro({ lat: null, lon: null, city: "Winston-Salem", location: "" }, "Raleigh"), false);
});

test("isInMetro reads a Triangle city out of a location line", () => {
  const at = (location: string) =>
    isInMetro({ lat: null, lon: null, city: "", location }, "Chapel Hill", { scope: "traveling" });
  assert.equal(at("Chapel Hill, N.C., Dorrance Field at Play2Dream Legacy Stadium"), true);
  assert.equal(at("Chapel Hill, Karen Shelton Stadium"), true); // unescaped comma, no state
  assert.equal(at("Cary, N.C., Cary Tennis Park"), true);
  assert.equal(at("Chapel Hill (UNC Finley Golf Club)"), true);
  assert.equal(at("Memphis, Tenn., Track and Soccer Complex"), false);
  assert.equal(at("Winston-Salem, NC"), false);
});

test("isInMetro rejects a same-named city in another state", () => {
  // UNH is in Durham, N.H. — a bare city-name match would wrongly claim it.
  const at = (location: string) => isInMetro({ lat: null, lon: null, city: "", location }, "Chapel Hill");
  assert.equal(at("Durham, N.H."), false);
  assert.equal(at("Durham, N.C."), true);
});

test("a traveling feed must prove a Triangle location, not inherit one", () => {
  // goheels ships a whole season, most of it on the road, and a foreign venue
  // carries no US state token to disqualify it. Nothing may fall back to
  // "Chapel Hill" just because the source is UNC.
  const at = (location: string) =>
    isInMetro({ lat: null, lon: null, city: "", location }, "Chapel Hill", { scope: "traveling" });
  assert.equal(at("Dublin, Ireland (Aviva Stadium)"), false);
  assert.equal(at("Paris, France"), false);
  assert.equal(at("Waimea, Hawai'i (Mauna Lani North Course)"), false);
  assert.equal(at("TBA"), false);
  assert.equal(at(""), false);
});

test("a venue-local feed keeps a 'Venue, Room' line", () => {
  // Duke's calendar only lists things happening at Duke, and writes the room
  // after a comma: "Duke South, Room M224". Reading the first slot as a city
  // would throw away a fifth of the feed.
  const at = (location: string) => isInMetro({ lat: null, lon: null, city: "", location }, "Durham");
  assert.equal(at("Duke South, Room M224"), true);
  assert.equal(at("Rubenstein Arts Center, (The Cube) Studio 224"), true);
  assert.equal(at("Fitzpatrick Center Schiciano Auditorium Side A, room 1464"), true);
  assert.equal(at("Duke Chapel"), true);
  assert.equal(at(""), true);
});

test("a venue-local feed still rejects a line that names another NC city", () => {
  const at = (location: string) => isInMetro({ lat: null, lon: null, city: "", location }, "Durham");
  assert.equal(at("Charlotte, N.C."), false);
  assert.equal(at("Beaufort, NC, Duke Marine Lab"), false);
  // …and a source outside the metro never lends its city to anything.
  assert.equal(isInMetro({ lat: null, lon: null, city: "", location: "Some Hall" }, "Asheville"), false);
});

// --- ingestFeed ------------------------------------------------------------

test("ingestFeed keeps Triangle games and drops away games", async () => {
  const res = ingestFeed(source(), await fixture("goheels.ics"), { now: NOW });
  assert.deepEqual(
    res.events.map((e) => e.name).sort(),
    [
      "North Carolina Field Hockey vs Wake Forest (Scrimmage)",
      "North Carolina Women's Tennis at ITA All-American Championships",
      "[L] North Carolina Women's Soccer vs Michigan State",
    ],
  );
  // Memphis, Dublin, Fayetteville (Ark.) and Winston-Salem all leave the metro —
  // note two of them are listed as "vs", so the title is no guide.
  assert.equal(res.dropped.out_of_metro, 4);
  assert.equal(res.errors.length, 0);
});

test("ingestFeed applies the date window when one is given", async () => {
  const res = ingestFeed(source(), await fixture("goheels.ics"), { now: NOW, window: WINDOW });
  assert.deepEqual(res.events.map((e) => e.name).sort(), [
    "North Carolina Field Hockey vs Wake Forest (Scrimmage)",
    "[L] North Carolina Women's Soccer vs Michigan State",
  ]);
  assert.equal(res.dropped.out_of_window, 1); // the September tennis championship
});

test("ingestFeed maps an ICS VEVENT onto the event schema", async () => {
  const res = ingestFeed(source(), await fixture("goheels.ics"), { now: NOW, window: WINDOW });
  const game = res.events.find((e) => e.name.includes("Michigan State"))!;
  assert.equal(game.venue, "Dorrance Field at Play2Dream Legacy Stadium");
  assert.equal(game.city, "Chapel Hill");
  assert.equal(game.start, "2026-08-23T13:00:00-04:00");
  assert.equal(game.end, "2026-08-23T15:00:00-04:00");
  assert.equal(game.duration_min, 120);
  assert.equal(game.category, "sports");
  assert.equal(game.price, "unknown");
  assert.equal(game.image_url, "unknown");
  assert.equal(game.source, "https://goheels.com/calendar");
  assert.equal(game.info_url, "https://admin.goheels.com/calendar.aspx?game_id=26998&sport_id=22");
  assert.equal(game.first_seen, NOW);
  assert.equal(game.last_verified, NOW);
});

test("ingestFeed maps a Localist event onto the event schema", async () => {
  const res = ingestFeed(DNCR, await fixture("dncr-localist.json"), { now: NOW, window: WINDOW });
  const waterbugs = res.events.find((e) => e.name === "Wacky Waterbugs")!;
  assert.equal(waterbugs.venue, "Eno River State Park - Fews Ford Access & Visitor Center");
  assert.equal(waterbugs.city, "Durham");
  assert.equal(waterbugs.address, "6101 Cole Mill Rd. , Durham , NC  27705");
  assert.equal(waterbugs.lat, 36.078519);
  assert.equal(waterbugs.price, "Free with Registration");
  assert.equal(waterbugs.booking_url, "unknown");
  assert.equal(waterbugs.info_url, "https://www.ncparks.gov/state-parks/eno-river-state-park");
  assert.match(waterbugs.image_url, /^https:\/\/localist-images\./);
  assert.match(waterbugs.description ?? "", /^Do you know what is hiding under the rocks/);
});

test("ingestFeed drops the non-Triangle DNCR sites", async () => {
  const res = ingestFeed(DNCR, await fixture("dncr-localist.json"), { now: NOW, window: WINDOW });
  const names = res.events.map((e) => e.name);
  assert.equal(names.some((n) => n.includes("Elk Knob")), false); // Todd, NC
  assert.equal(names.some((n) => n === "Fire on the Mountain"), false); // Chimney Rock
  assert.equal(res.dropped.out_of_metro, 2);
});

test("ingestFeed keeps a Duke event whose location names no city", async () => {
  const res = ingestFeed(DUKE, await fixture("duke-calendar.ics"), { now: NOW, window: WINDOW });
  const market = res.events.find((e) => e.name === "Duke Farmers Market")!;
  assert.equal(market.city, "Durham"); // from the source, since the feed says "None"
  assert.equal(market.venue, "unknown");
  assert.equal(res.events.length, 4);
});

test("ingestFeed drops items with no start timestamp and counts them", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "SUMMARY:Job Opening - Marketing Manager",
    "LOCATION:Raleigh\\, N.C.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const res = ingestFeed(source(), ics, { now: NOW });
  assert.equal(res.events.length, 0);
  assert.equal(res.dropped.no_start, 1);
});

test("ingestFeed drops a dated item with no title", () => {
  const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART:20260824T230000Z",
    "LOCATION:Chapel Hill\\, N.C.", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const res = ingestFeed(source(), ics, { now: NOW });
  assert.equal(res.events.length, 0); // an unnamed event fails `npm run validate`
  assert.equal(res.dropped.no_title, 1);
});

test("a WordPress blog feed yields zero events", async () => {
  const raw = await fixture("wordpress-blog.rss");
  for (const feed_type of ["ics", "localist"] as const) {
    const res = ingestFeed(
      source({ ingest: { mode: "feed", feed_url: "https://raleighlittletheatre.org/feed/", feed_type } }),
      raw,
      { now: NOW },
    );
    assert.equal(res.events.length, 0, `${feed_type} must yield nothing`);
    assert.match(res.errors.join(" "), /blog feed|RSS|Atom/i);
  }
});

test("looksLikeSyndicationFeed spots an RSS document and not an ICS one", async () => {
  assert.equal(looksLikeSyndicationFeed(await fixture("wordpress-blog.rss")), true);
  assert.equal(looksLikeSyndicationFeed(await fixture("goheels.ics")), false);
  assert.equal(looksLikeSyndicationFeed(await fixture("dncr-localist.json")), false);
});

test("ingestFeed ids come from computeId and are stable across runs", async () => {
  const raw = await fixture("goheels.ics");
  const first = ingestFeed(source(), raw, { now: NOW, window: WINDOW });
  const second = ingestFeed(source(), raw, { now: "2026-08-24T06:00:00-04:00", window: WINDOW });
  assert.deepEqual(
    first.events.map((e) => e.id),
    second.events.map((e) => e.id),
  );
  for (const e of first.events) {
    assert.equal(e.id, computeId(e));
  }
});

test("ingestFeed collapses two listings of the same occurrence", () => {
  const vevent = (uid: string, summary: string) =>
    ["BEGIN:VEVENT", `UID:${uid}`, `SUMMARY:${summary}`, "DTSTART:20260824T230000Z", "DTEND:20260825T010000Z",
      "LOCATION:Chapel Hill\\, N.C., Kenan Stadium", "END:VEVENT"].join("\r\n");
  const ics = ["BEGIN:VCALENDAR", vevent("a", "Tar Heels vs Duke"), vevent("b", "Duke vs Tar Heels"), "END:VCALENDAR"]
    .join("\r\n");
  const res = ingestFeed(source(), ics, { now: NOW });
  assert.equal(res.events.length, 1); // normName is order-insensitive, so both hash alike
  assert.equal(res.dropped.duplicate, 1);
});

test("ingestFeed reports a source that declares no feed", async () => {
  const bare = source({ ingest: undefined });
  const res = ingestFeed(bare, await fixture("goheels.ics"), { now: NOW });
  assert.equal(res.events.length, 0);
  assert.match(res.errors.join(" "), /no feed/i);
});
