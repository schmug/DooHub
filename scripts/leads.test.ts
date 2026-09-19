import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ingestLeads,
  leadId,
  parseRedditAtom,
  parseWeekendPost,
  pickWeekendPost,
  rankVenues,
  weekendDates,
} from "./lib/leads.js";
import { computeId } from "./lib/dedup.js";
import type { EventSource, TriangleEvent } from "./lib/types.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => readFile(join(FIXTURES, name), "utf8");

// The fixture was captured 2026-09-19: the 2026-09-18 and 2026-09-11 posts.
// Every window below is anchored there so the tests stay deterministic.
const WINDOW = { start: "2026-09-18T00:00:00-04:00", end: "2026-09-20T23:59:59-04:00" };

function source(over: Partial<EventSource> = {}): EventSource {
  return {
    id: "thingstodo919",
    name: "Things To Do In Raleigh (u/Thingstodo919)",
    kind: "aggregator",
    url: "https://www.reddit.com/user/Thingstodo919/submitted",
    city: "Raleigh",
    categories: ["festivals"],
    ingest: {
      mode: "leads",
      feed_url: "https://www.reddit.com/user/Thingstodo919/submitted.rss",
      title_match: "Things to do this weekend",
    },
    ...over,
  };
}

function stored(over: Partial<TriangleEvent> = {}): TriangleEvent {
  const ev: TriangleEvent = {
    id: "",
    name: "Hog Day",
    category: "festivals",
    tags: [],
    venue: "River Park",
    address: "unknown",
    city: "Hillsborough",
    lat: null,
    lon: null,
    start: "2026-09-18T18:00:00-04:00",
    end: "",
    duration_min: null,
    price: "unknown",
    budget: "unknown",
    indoor_outdoor: "outdoor",
    vegan: "unknown",
    vegetarian: "unknown",
    weather: null,
    image_url: "unknown",
    booking_url: "unknown",
    info_url: "https://www.hogday.org/",
    source: "https://www.hogday.org/",
    first_seen: "2026-09-17T07:30:00-04:00",
    last_verified: "2026-09-17T07:30:00-04:00",
    ...over,
  };
  ev.id = computeId(ev);
  return ev;
}

/** A minimal Atom document in Reddit's shape, for cases the fixture lacks. */
function atom(entries: Array<{ title: string; href: string; published: string; content: string }>): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">` +
    entries
      .map(
        (e) =>
          `<entry><title>${esc(e.title)}</title><link href="${e.href}" />` +
          `<published>${e.published}</published><updated>${e.published}</updated>` +
          `<content type="html">${esc(e.content)}</content></entry>`,
      )
      .join("") +
    `</feed>`
  );
}

const POST = (items: Record<string, string[]>) =>
  Object.entries(items)
    .map(([day, lis]) => `<p>${day}</p><ul>${lis.map((li) => `<li>${li}</li>`).join("")}</ul>`)
    .join("");

// --- Atom ------------------------------------------------------------------

test("parseRedditAtom reads every entry with its title, link, date and html body", async () => {
  const posts = parseRedditAtom(await fixture("thingstodo919-submitted.atom"));
  assert.equal(posts.length, 2);
  assert.equal(posts[0]!.title, "Things to do this weekend!");
  assert.equal(posts[0]!.url, "https://www.reddit.com/r/raleigh/comments/1wjqwbv/things_to_do_this_weekend/");
  assert.equal(posts[0]!.published, "2026-09-18T13:55:10+00:00");
  // The body is HTML-escaped inside <content>; it must come back as markup.
  assert.match(posts[0]!.content, /<p>Friday<\/p>/);
  assert.match(posts[0]!.content, /<a href="https:\/\/ncsymphony\.org\//);
});

test("parseRedditAtom throws on a body that is not an Atom feed", () => {
  assert.throws(() => parseRedditAtom("<!DOCTYPE html><html><title>Welcome to Reddit</title></html>"), /Atom/);
});

test("pickWeekendPost takes the newest entry whose title matches, ignoring case and punctuation", () => {
  const posts = parseRedditAtom(
    atom([
      { title: "Best taco truck?", href: "https://r/x", published: "2026-09-19T10:00:00+00:00", content: "<p>hi</p>" },
      { title: "Things to do this weekend!!", href: "https://r/b", published: "2026-09-18T10:00:00+00:00", content: "" },
      { title: "Things to do this weekend!", href: "https://r/a", published: "2026-09-11T10:00:00+00:00", content: "" },
    ]),
  );
  assert.equal(pickWeekendPost(posts, "things to do this weekend")?.url, "https://r/b");
  assert.equal(pickWeekendPost(posts, "Restaurant week"), null);
});

// --- Dates -----------------------------------------------------------------

test("weekendDates resolves Friday/Saturday/Sunday from a Friday post", () => {
  assert.deepEqual(weekendDates("2026-09-18T13:55:10+00:00"), {
    Friday: "2026-09-18",
    Saturday: "2026-09-19",
    Sunday: "2026-09-20",
  });
});

test("weekendDates rolls a Thursday post forward and a Saturday repost back", () => {
  assert.equal(weekendDates("2026-04-02T12:00:00+00:00").Friday, "2026-04-03");
  assert.equal(weekendDates("2026-09-19T14:00:00+00:00").Friday, "2026-09-18");
});

test("weekendDates reads the post date in America/New_York, not UTC", () => {
  // 03:30Z on Saturday is still Friday 23:30 in New York.
  assert.equal(weekendDates("2026-09-19T03:30:00+00:00").Friday, "2026-09-18");
});

// --- Post body -------------------------------------------------------------

test("parseWeekendPost yields one lead per linked list item, under its day", async () => {
  const post = pickWeekendPost(parseRedditAtom(await fixture("thingstodo919-submitted.atom")), "Things to do")!;
  const leads = parseWeekendPost(post);
  const byDay = { Friday: 0, Saturday: 0, Sunday: 0 };
  for (const l of leads) byDay[l.day]++;
  assert.deepEqual(byDay, { Friday: 65, Saturday: 106, Sunday: 32 });
  assert.deepEqual(leads[0], {
    day: "Friday",
    local_date: "2026-09-18",
    name: "Rachmaninoff Piano Concerto No. 3",
    venue: "Meymandi Concert Hall",
    city: "Raleigh",
    url: "https://ncsymphony.org/events/rachmaninoff-piano-concerto-no-3-fri-8pm/?utm_source=rach3&utm_medium=slider&utm_campaign=2627&utm_id=rach3",
  });
});

test("parseWeekendPost ignores the footer links and keeps only day sections", async () => {
  const post = pickWeekendPost(parseRedditAtom(await fixture("thingstodo919-submitted.atom")), "Things to do")!;
  const urls = parseWeekendPost(post).map((l) => l.url);
  assert.ok(!urls.some((u) => u.includes("mailchi.mp")));
  assert.ok(!urls.some((u) => u.includes("reddit.com")));
});

test("parseWeekendPost decodes entities and trims a venue with a trailing space", () => {
  const post = {
    title: "Things to do this weekend!",
    url: "https://r/p",
    published: "2026-09-18T12:00:00+00:00",
    content: POST({
      Saturday: [
        `<a href="https://x.test/a?b=1&amp;c=2">Field &amp; Factory: Tobacco&#39;s Laborer Walk</a>, Duke Homestead, Durham `,
      ],
    }),
  };
  assert.deepEqual(parseWeekendPost(post), [
    {
      day: "Saturday",
      local_date: "2026-09-19",
      name: "Field & Factory: Tobacco's Laborer Walk",
      venue: "Duke Homestead",
      city: "Durham",
      url: "https://x.test/a?b=1&c=2",
    },
  ]);
});

test("parseWeekendPost keeps a comma inside the venue name", () => {
  const post = {
    title: "t",
    url: "https://r/p",
    published: "2026-09-18T12:00:00+00:00",
    content: POST({ Friday: [`<a href="https://x.test/">Willow Branch</a>, Yonder, Not Just a Bar, Hillsborough`] }),
  };
  const [lead] = parseWeekendPost(post);
  assert.equal(lead!.venue, "Yonder, Not Just a Bar");
  assert.equal(lead!.city, "Hillsborough");
});

test("parseWeekendPost treats a lone Triangle town after the link as the city, not the venue", () => {
  const post = {
    title: "t",
    url: "https://r/p",
    published: "2026-09-18T12:00:00+00:00",
    content: POST({ Saturday: [`<a href="https://x.test/">Open House</a>, Carrboro`] }),
  };
  const [lead] = parseWeekendPost(post);
  assert.equal(lead!.venue, "");
  assert.equal(lead!.city, "Carrboro");
});

// --- Ingest ----------------------------------------------------------------

test("ingestLeads refuses a source that does not declare leads", async () => {
  const r = ingestLeads(source({ ingest: undefined }), await fixture("thingstodo919-submitted.atom"), { window: WINDOW });
  assert.equal(r.leads.length, 0);
  assert.match(r.errors[0]!, /leads/);
});

test("ingestLeads reports an error, not zero leads, when no post matches", async () => {
  const src = source({ ingest: { mode: "leads", feed_url: "https://x.test/f.rss", title_match: "Restaurant week" } });
  const r = ingestLeads(src, await fixture("thingstodo919-submitted.atom"), { window: WINDOW });
  assert.equal(r.leads.length, 0);
  assert.equal(r.post_url, null);
  assert.match(r.errors[0]!, /Restaurant week/);
});

test("ingestLeads names the post it read and keeps every in-window Triangle lead", async () => {
  const r = ingestLeads(source(), await fixture("thingstodo919-submitted.atom"), { window: WINDOW });
  assert.deepEqual(r.errors, []);
  assert.equal(r.post_url, "https://www.reddit.com/r/raleigh/comments/1wjqwbv/things_to_do_this_weekend/");
  assert.equal(r.published, "2026-09-18T13:55:10+00:00");
  // 203 listed, minus the one Cedar Grove lead (outside the metro ring).
  assert.equal(r.leads.length, 202);
  assert.equal(r.dropped.out_of_metro, 1);
  assert.equal(r.dropped.out_of_window, 0);
  assert.equal(r.dropped.already_in_store, 0);
});

test("ingestLeads drops leads outside the window", async () => {
  const r = ingestLeads(source(), await fixture("thingstodo919-submitted.atom"), {
    window: { start: "2026-09-18T00:00:00-04:00", end: "2026-09-19T23:59:59-04:00" },
  });
  assert.equal(r.dropped.out_of_window, 32);
  assert.ok(r.leads.every((l) => l.day !== "Sunday"));
});

test("ingestLeads drops a lead whose computed id is already in the store", async () => {
  const ev = stored({ name: "Rachmaninoff Piano Concerto No. 3", venue: "Meymandi Concert Hall", city: "Raleigh", start: "2026-09-18T20:00:00-04:00" });
  const r = ingestLeads(source(), await fixture("thingstodo919-submitted.atom"), { window: WINDOW, store: [ev] });
  assert.equal(r.dropped.already_in_store, 1);
  const rach = r.leads.filter((l) => l.name.startsWith("Rachmaninoff"));
  // The Friday performance is stored; Saturday's is another occurrence and stays.
  assert.deepEqual(rach.map((l) => l.local_date), ["2026-09-19"]);
});

test("ingestLeads drops a lead the dedup rules would merge into a stored event", async () => {
  // "Hillsborough Hog Day 2026" at "River Park" on 9/18 vs the stored "Hog Day"
  // at "River Park" the same evening: different id, same occurrence (title subset).
  const r = ingestLeads(source(), await fixture("thingstodo919-submitted.atom"), { window: WINDOW, store: [stored()] });
  assert.equal(r.dropped.already_in_store, 1);
  assert.ok(!r.leads.some((l) => l.local_date === "2026-09-18" && /hog day/i.test(l.name)));
  // The Saturday Hog Day lead is a different occurrence and must survive.
  assert.ok(r.leads.some((l) => l.local_date === "2026-09-19" && /hog day/i.test(l.name)));
});

test("leadId is the id the event will get once it is built from the lead", () => {
  const lead = { day: "Friday" as const, local_date: "2026-09-18", name: "Hog Day", venue: "River Park", city: "Hillsborough", url: "https://x" };
  assert.equal(leadId(lead), stored().id);
});

// --- Venue ranking (PR 2's input) -------------------------------------------

test("rankVenues counts the weeks each off-registry venue is listed, newest post first", async () => {
  const posts = parseRedditAtom(await fixture("thingstodo919-submitted.atom"));
  const registry = [source(), { ...source(), id: "goodnights", name: "Goodnights Comedy Club", url: "https://www.goodnightscomedy.com/", ingest: undefined }];
  const rows = rankVenues(posts, "Things to do", registry);
  const slims = rows.find((r) => r.venue === "slim's dive bar")!;
  assert.equal(slims.weeks, 2);
  assert.equal(slims.city, "Raleigh");
  assert.equal(slims.domain, "slimsdivebar.com");
  assert.equal(slims.in_registry, false);
  assert.equal(rows.find((r) => r.venue === "goodnights comedy club")!.in_registry, true);
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1]!.weeks >= r.weeks));
});

test("rankVenues recognises a registry venue by alias and by the hall-in-complex name the posts use", async () => {
  const posts = parseRedditAtom(await fixture("thingstodo919-submitted.atom"));
  const registry: EventSource[] = [
    { ...source(), id: "durham-bulls", name: "Durham Bulls", url: "https://www.milb.com/durham", venue_aliases: ["DBAP", "Durham Bulls Athletic Park"], ingest: undefined },
    { ...source(), id: "meymandi", name: "Meymandi Concert Hall", url: "https://www.martinmariettacenter.com/events", ingest: undefined },
  ];
  assert.equal(rankVenues(posts, "Things to do", registry).find((r) => r.venue === "dbap")!.in_registry, true);
  // Other weeks write the hall as "Hall at Complex"; the fixture's two weeks do not.
  const hallAtComplex = parseRedditAtom(
    atom([
      {
        title: "Things to do this weekend!",
        href: "https://r/h",
        published: "2026-09-04T12:00:00+00:00",
        content: POST({
          Friday: [`<a href="https://ncsymphony.org/x">Brahms</a>, Meymandi Concert Hall at Martin Marietta Center for the Performing Arts, Raleigh`],
        }),
      },
    ]),
  );
  const [row] = rankVenues(hallAtComplex, "Things to do", registry);
  assert.equal(row!.venue, "meymandi concert hall at martin marietta center for the performing arts");
  assert.equal(row!.in_registry, true);
});
