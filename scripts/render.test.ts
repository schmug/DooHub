import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extractItems,
  extractJsonLdItems,
  extractTextItems,
  htmlToText,
  ingestRender,
  looksBlocked,
  nyIso,
} from "./lib/render.js";
import { ingestSources, runWindow } from "./render_source.js";
import { computeId } from "./lib/dedup.js";
import type { EventSource } from "./lib/types.js";

const BANDSINTOWN = new URL("./fixtures/bandsintown-chapel-of-bones.html", import.meta.url);
const LENOVO = new URL("./fixtures/lenovo-center-events.html", import.meta.url);

/** The run date both fixtures were captured on. */
const NOW = new Date("2026-08-23T09:00:00-04:00");
const OPTS = { now: NOW.toISOString() };

const BONES: EventSource = {
  id: "chapel-of-bones",
  name: "Chapel of Bones",
  kind: "venue",
  url: "https://www.bandsintown.com/v/10409371-chapel-of-bones",
  city: "Raleigh",
  categories: ["concerts", "nightlife"],
  ingest: { mode: "render", extract: "json-ld" },
};

const LENOVO_SRC: EventSource = {
  id: "lenovo-center",
  name: "Lenovo Center",
  kind: "venue",
  url: "https://www.lenovocenter.com/events",
  city: "Raleigh",
  categories: ["sports", "concerts"],
  ingest: { mode: "render", extract: "text" },
};

function page(...blocks: string[]): string {
  return `<!DOCTYPE html><html><head><title>t</title></head><body>${blocks
    .map((b) => `<script type="application/ld+json">${b}</script>`)
    .join("")}</body></html>`;
}

const EVENT = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: "Art in the Evening",
  startDate: "2026-08-25T19:00:00",
};

/** JSON-LD items for one inline node, for the field-mapping tests. */
function oneItem(node: Record<string, unknown>) {
  const items = extractJsonLdItems(page(JSON.stringify({ ...EVENT, ...node })));
  assert.equal(items.length, 1);
  return items[0]!;
}

// --- America/New_York offsets ------------------------------------------------

test("nyIso stamps the summer (EDT) offset", () => {
  assert.equal(nyIso(2026, 8, 23, 18, 0), "2026-08-23T18:00:00-04:00");
});

test("nyIso stamps the winter (EST) offset", () => {
  assert.equal(nyIso(2027, 1, 8, 19, 0), "2027-01-08T19:00:00-05:00");
});

// --- JSON-LD extraction ------------------------------------------------------

test("extracts every MusicEvent from the Bandsintown fixture, in page order", async () => {
  const html = await readFile(BANDSINTOWN, "utf8");
  const items = extractJsonLdItems(html);
  assert.equal(items.length, 5);
  assert.deepEqual(
    items.slice(0, 3).map((e) => `${e.title} | ${e.start}`),
    [
      "Harsh Realm @ Chapel of Bones | 2026-08-23T18:00:00-04:00",
      "Narcotic Wasteland @ Chapel of Bones | 2026-08-28T18:00:00-04:00",
      "Exist @ Chapel of Bones | 2026-08-30T19:00:00-04:00",
    ],
  );
});

test("the Bandsintown fixture's non-event blocks are all filtered out", async () => {
  // MusicVenue, Review and FAQPage share the page with the events. A filter on
  // "has a name" or "parses as JSON" would sweep all three in.
  const html = await readFile(BANDSINTOWN, "utf8");
  const items = extractJsonLdItems(html);
  assert.ok(!items.some((e) => /Heathen|Jorp|best way to get/i.test(e.title)));
});

test("@type matching is a substring test, so MusicEvent counts as an event", () => {
  assert.equal(extractJsonLdItems(page(JSON.stringify({ ...EVENT, "@type": "MusicEvent" }))).length, 1);
});

test("an @type array containing an event type counts as an event", () => {
  assert.equal(extractJsonLdItems(page(JSON.stringify({ ...EVENT, "@type": ["Thing", "TheaterEvent"] }))).length, 1);
});

test("a non-event @type is not extracted", () => {
  assert.deepEqual(extractJsonLdItems(page(JSON.stringify({ ...EVENT, "@type": "Organization" }))), []);
});

test("nodes nested under @graph are extracted", () => {
  assert.equal(extractJsonLdItems(page(JSON.stringify({ "@graph": [EVENT] }))).length, 1);
});

test("a malformed JSON-LD block is skipped without losing the valid ones", () => {
  const items = extractJsonLdItems(page("{ not json", JSON.stringify(EVENT)));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, "Art in the Evening");
});

test("a naive startDate is stamped with the venue's America/New_York offset", () => {
  assert.equal(oneItem({}).start, "2026-08-25T19:00:00-04:00");
});

test("a startDate that already carries an offset keeps its wall time", () => {
  assert.equal(oneItem({ startDate: "2026-08-25T19:00:00-04:00" }).start, "2026-08-25T19:00:00-04:00");
});

test("a UTC startDate is re-expressed in Eastern", () => {
  assert.equal(oneItem({ startDate: "2026-08-25T23:00:00Z" }).start, "2026-08-25T19:00:00-04:00");
});

test("a date-only startDate yields midnight and flags the time as unknown", () => {
  const item = oneItem({ startDate: "2026-08-25" });
  assert.equal(item.start, "2026-08-25T00:00:00-04:00");
  assert.equal(item.start_time_known, false);
});

test("an endDate that is not after the start is dropped", () => {
  // Bandsintown's real shape: startDate "2026-08-23T18:00:00", endDate
  // "2026-08-23". Passed through, that end is BEFORE the start, which
  // validate.ts reports as an error on every event.
  assert.equal(oneItem({ startDate: "2026-08-25T19:00:00", endDate: "2026-08-25" }).end, null);
});

test("an endDate after the start is kept", () => {
  assert.equal(oneItem({ endDate: "2026-08-25T22:00:00" }).end, "2026-08-25T22:00:00-04:00");
});

test("location name, address and geo are carried into the item", async () => {
  const html = await readFile(BANDSINTOWN, "utf8");
  const item = extractJsonLdItems(html)[0]!;
  assert.equal(item.location, "Chapel of Bones");
  assert.equal(item.city, "Raleigh");
  assert.equal(item.address, "658 Maywood Ave, Raleigh, NC");
  assert.equal(item.lat, 35.7618674);
  assert.equal(item.lon, -78.6576791);
});

test("offers supply the booking url and price", () => {
  const item = oneItem({
    offers: { "@type": "Offer", url: "https://tix.example/1", price: "15", priceCurrency: "USD" },
  });
  assert.equal(item.booking_url, "https://tix.example/1");
  assert.equal(item.price, "$15");
});

test("a free offer reads as Free", () => {
  assert.equal(oneItem({ offers: { "@type": "Offer", price: 0, priceCurrency: "USD" } }).price, "Free");
});

// --- Rendered-text extraction ------------------------------------------------

test("htmlToText drops script, style and svg content", () => {
  const text = htmlToText(
    "<p>Keep</p><script>var drop=1</script><style>.drop{}</style><svg><path d='M0 0'/></svg><p>This</p>",
  );
  assert.equal(text, "Keep\nThis");
});

test("htmlToText does not emit attribute values as text", () => {
  assert.equal(htmlToText('<img src="x.jpg" alt="More Info for Rod Wave"><p>Rod Wave</p>'), "Rod Wave");
});

const LENOVO_URL = "https://www.lenovocenter.com/events";

test("extracts every event from the rendered lenovo-center fixture", async () => {
  const html = await readFile(LENOVO, "utf8");
  const items = extractTextItems(html, LENOVO_URL, NOW);
  assert.deepEqual(
    items.map((e) => `${e.title} | ${e.start}`),
    [
      "Lenovo Center Hiring Event | 2026-08-25T15:00:00-04:00",
      "Rod Wave | 2026-09-15T20:00:00-04:00",
      "Cash Money + No Limit Tour | 2026-09-19T20:00:00-04:00",
      "Florida Panthers vs. Carolina Hurricanes | 2026-09-22T19:00:00-04:00",
    ],
  );
});

test("text items take their url and image from the listing row", async () => {
  const html = await readFile(LENOVO, "utf8");
  const item = extractTextItems(html, LENOVO_URL, NOW).find((e) => e.title === "Rod Wave")!;
  assert.equal(item.url, "https://www.lenovocenter.com/events/detail/rodwave_ral26");
  assert.match(item.image_url, /^https:\/\/www\.lenovocenter\.com\/assets\/img\/RodWave-/);
});

test("chrome labels between the date and the title are not read as the title", async () => {
  const html = await readFile(LENOVO, "utf8");
  const titles = extractTextItems(html, LENOVO_URL, NOW).map((e) => e.title);
  assert.ok(!titles.some((t) => /event time|buy tickets|more info|parking/i.test(t)));
});

test("a date written on one line is read as well as one split across spans", () => {
  const items = extractTextItems(
    "<ul><li><h3>Quiz Night</h3><p>Thursday, September 3, 2026</p><p>7:30 PM</p></li></ul>",
    LENOVO_URL,
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, "Quiz Night");
  assert.equal(items[0]!.start, "2026-09-03T19:30:00-04:00");
});

test("a date with no year resolves to its next occurrence on or after now", () => {
  // "Jan 8" seen on 2026-08-23 is next January, not eight months ago.
  const items = extractTextItems("<div><p>Jan 8</p><h3>Modele</h3><p>7:00 PM</p></div>", LENOVO_URL, NOW);
  assert.equal(items[0]!.start, "2027-01-08T19:00:00-05:00");
});

test("a date behind a listing label is still read", () => {
  // Live lenovo-center markup for a rescheduled show: the date cell reads
  // "New Date - Nov. 22". Anchoring on the whole cell drops the event silently.
  const items = extractTextItems(
    "<div><p>New Date - Nov. 22</p><h3>Gabriel Iglesias</h3><p>7:00 PM</p></div>",
    LENOVO_URL,
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, "Gabriel Iglesias");
  assert.equal(items[0]!.start, "2026-11-22T19:00:00-05:00");
});

test("a listing with no time yields midnight and flags the time as unknown", () => {
  const items = extractTextItems("<div><p>Sep 3, 2026</p><h3>Fall Market</h3></div>", LENOVO_URL, NOW);
  assert.equal(items[0]!.start, "2026-09-03T00:00:00-04:00");
  assert.equal(items[0]!.start_time_known, false);
});

test("a page with no dates yields no candidates", () => {
  assert.deepEqual(extractTextItems("<p>Sorry, no events are on sale right now.</p>", LENOVO_URL, NOW), []);
});

// --- Choosing an extraction strategy ------------------------------------------

test("auto prefers JSON-LD when the page carries event JSON-LD", async () => {
  const html = await readFile(BANDSINTOWN, "utf8");
  const { items, extract } = extractItems(html, BONES.url, NOW, "auto");
  assert.equal(extract, "json-ld");
  assert.equal(items.length, 5);
});

test("auto falls back to text when the page's only JSON-LD is not an event", async () => {
  // lenovo-center carries exactly one ld+json block and it is an Organization.
  const html = await readFile(LENOVO, "utf8");
  const { items, extract } = extractItems(html, LENOVO_URL, NOW, "auto");
  assert.equal(extract, "text");
  assert.equal(items.length, 4);
});

test("json-ld mode does not silently fall back to text", async () => {
  const html = await readFile(LENOVO, "utf8");
  const { items, extract } = extractItems(html, LENOVO_URL, NOW, "json-ld");
  assert.equal(extract, "json-ld");
  assert.deepEqual(items, []);
});

// --- Draft events -------------------------------------------------------------

test("ingestRender turns the Bandsintown fixture into schema-shaped drafts", async () => {
  const html = await readFile(BANDSINTOWN, "utf8");
  const { events, extract, errors } = ingestRender(BONES, html, OPTS);
  assert.deepEqual(errors, []);
  assert.equal(extract, "json-ld");
  const ev = events[0]!;
  assert.equal(ev.name, "Harsh Realm @ Chapel of Bones");
  assert.equal(ev.venue, "Chapel of Bones");
  assert.equal(ev.city, "Raleigh");
  assert.equal(ev.address, "658 Maywood Ave, Raleigh, NC");
  assert.equal(ev.start, "2026-08-23T18:00:00-04:00");
  assert.equal(ev.end, ""); // the bare-date endDate was dropped
  assert.equal(ev.category, "concerts"); // the source's first category
  assert.equal(ev.price, "unknown");
  assert.equal(ev.budget, "unknown");
  assert.equal(ev.source, BONES.url);
  assert.equal(ev.first_seen, OPTS.now);
  assert.equal(ev.last_verified, OPTS.now);
  assert.match(ev.booking_url, /^https:\/\/www\.bandsintown\.com\/e\//);
});

test("draft events carry the pipeline's own computeId", async () => {
  const html = await readFile(BANDSINTOWN, "utf8");
  const ev = ingestRender(BONES, html, OPTS).events[0]!;
  assert.equal(ev.id, computeId(ev));
});

test("re-reading the same page yields the same ids", async () => {
  const html = await readFile(BANDSINTOWN, "utf8");
  const a = ingestRender(BONES, html, OPTS).events.map((e) => e.id);
  const b = ingestRender(BONES, html, { now: "2026-08-30T09:00:00-04:00" }).events.map((e) => e.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test("text drafts fall back to the registry venue and city", async () => {
  const html = await readFile(LENOVO, "utf8");
  const ev = ingestRender(LENOVO_SRC, html, OPTS).events[0]!;
  assert.equal(ev.venue, "Lenovo Center");
  assert.equal(ev.city, "Raleigh");
  assert.equal(ev.address, "unknown");
});

test("ingestRender applies the run's window", async () => {
  const html = await readFile(BANDSINTOWN, "utf8");
  const { events, dropped } = ingestRender(BONES, html, { ...OPTS, window: runWindow(NOW, 7) });
  assert.deepEqual(events.map((e) => e.name), [
    "Harsh Realm @ Chapel of Bones",
    "Narcotic Wasteland @ Chapel of Bones",
    "Exist @ Chapel of Bones",
  ]);
  assert.equal(dropped.out_of_window, 2);
});

test("ingestRender warns about events whose listing gave no start time", () => {
  const html = "<div><p>Aug 25, 2026</p><h3>Fall Market</h3></div>";
  const { events, warnings } = ingestRender({ ...LENOVO_SRC, ingest: { mode: "render", extract: "text" } }, html, OPTS);
  assert.equal(events.length, 1);
  assert.match(warnings.join(" "), /no start time.*Fall Market/);
});

// --- Failure modes -------------------------------------------------------------

test("a Cloudflare block page is reported, not read as zero events", () => {
  // The nine-weeks-of-zeros failure this path exists to kill: a blocked render
  // and a genuinely empty week look identical unless the block is named.
  const blocked =
    "<html><head><title>Attention Required! | Cloudflare</title></head>" +
    "<body><h1>Sorry, you have been blocked</h1></body></html>";
  assert.match(looksBlocked(blocked) ?? "", /cloudflare/i);
});

test("a real listing page is not reported as blocked", async () => {
  for (const f of [BANDSINTOWN, LENOVO]) {
    assert.equal(looksBlocked(await readFile(f, "utf8")), null);
  }
});

test("ingestRender errors instead of returning zero for a blocked page", () => {
  const res = ingestRender(BONES, "<title>Just a moment...</title>", OPTS);
  assert.deepEqual(res.events, []);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0]!, /chapel-of-bones/);
  assert.match(res.errors[0]!, /NOT a quiet week/);
});

test("ingestRender warns when a render-declared source yields nothing", () => {
  const res = ingestRender(BONES, "<html><body><p>nothing here</p></body></html>", OPTS);
  assert.deepEqual(res.events, []);
  assert.deepEqual(res.errors, []);
  assert.match(res.warnings.join(" "), /0 events/);
});

test("ingestRender refuses a source that has not declared rendering", () => {
  // Burning Coal is the cautionary case: its season page is server-rendered, so
  // rendering it is waste. Only a declared source is read this way.
  const burningCoal: EventSource = {
    id: "burning-coal-theatre",
    name: "Burning Coal Theatre Company",
    kind: "venue",
    url: "https://burningcoal.org/",
    city: "Raleigh",
    categories: ["theater"],
  };
  const res = ingestRender(burningCoal, "<html><p>Sep 3, 2026</p><h3>A Play</h3></html>", OPTS);
  assert.deepEqual(res.events, []);
  assert.match(res.errors.join(" "), /no render declared/);
});

test("a feed-declared source is not read as a rendered page", () => {
  const feedSource: EventSource = {
    id: "duke-calendar",
    name: "Duke University",
    kind: "hub",
    url: "https://calendar.duke.edu/",
    city: "Durham",
    categories: ["concerts"],
    ingest: { mode: "feed", feed_url: "https://calendar.duke.edu/index.ics", feed_type: "ics" },
  };
  const res = ingestRender(feedSource, "<html><p>Sep 3, 2026</p><h3>A Talk</h3></html>", OPTS);
  assert.deepEqual(res.events, []);
  assert.match(res.errors.join(" "), /no render declared/);
});

// --- Failure isolation across a sweep ------------------------------------------

test("a render failure warns and leaves the other sources unaffected", async () => {
  const html = await readFile(LENOVO, "utf8");
  const broken: EventSource = {
    id: "broken-source",
    name: "Broken Source",
    kind: "venue",
    url: "https://broken.example/events",
    city: "Raleigh",
    categories: ["concerts"],
    ingest: { mode: "render" },
  };

  const results = await ingestSources(
    [broken, LENOVO_SRC],
    async (url) => {
      if (url.includes("broken.example")) throw new Error("net::ERR_CONNECTION_REFUSED");
      return html;
    },
    { now: NOW, days: null },
  );

  const failed = results.find((r) => r.id === "broken-source")!;
  assert.deepEqual(failed.events, []);
  assert.match(failed.errors.join(" "), /ERR_CONNECTION_REFUSED/);

  const ok = results.find((r) => r.id === "lenovo-center")!;
  assert.equal(ok.events.length, 4);
  assert.deepEqual(ok.errors, []);
});

test("ingestSources never renders a source that has not declared it", async () => {
  const results = await ingestSources(
    [
      {
        id: "burning-coal-theatre",
        name: "Burning Coal",
        kind: "venue",
        url: "https://burningcoal.org/",
        city: "Raleigh",
        categories: ["theater"],
      },
    ],
    async () => {
      throw new Error("should not have rendered");
    },
    { now: NOW },
  );
  assert.deepEqual(results[0]!.events, []);
  assert.match(results[0]!.errors.join(" "), /no render declared/);
});

test("ingestSources filters to the run's window by default", async () => {
  const html = await readFile(BANDSINTOWN, "utf8");
  const [res] = await ingestSources([BONES], async () => html, { now: NOW, days: 7 });
  assert.deepEqual(res!.events.map((e) => e.name), [
    "Harsh Realm @ Chapel of Bones",
    "Narcotic Wasteland @ Chapel of Bones",
    "Exist @ Chapel of Bones",
  ]);
});

test("runWindow spans today through today+7 in Eastern", () => {
  assert.deepEqual(runWindow(NOW, 7), { start: "2026-08-23T00:00:00-04:00", end: "2026-08-30T23:59:00-04:00" });
});
