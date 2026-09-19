// Lead-list ingestion for registry sources that declare
// `"ingest": { "mode": "leads" }` (data/sources.json): a curated, human-written
// post that names events and links each to its primary page, but carries no
// start times, prices or images. This turns the post into LEADS — name, venue,
// city, date, primary link — and drops the ones the store already has, so what
// comes out is the gap list. The weekly run then opens each lead's link and
// builds the event from that page (prompts/weekly.md § Phase A). A lead is
// never an event on the post's say-so: no primary page, no event.
//
// Today's only source is u/Thingstodo919's weekly "Things to do this weekend!"
// post on r/raleigh, read through Reddit's per-user Atom feed. The post body is
// `<p>Friday</p><ul><li><a href="…">Name</a>, Venue, City</li>…</ul>`, repeated
// for Saturday and Sunday, then a footer of newsletter and Reddit links.
//
// Pure: no fs, no network, no DOM. Takes the already-fetched Atom body as a
// string, so it is unit-testable against scripts/fixtures/. The CLI
// (scripts/leads_source.ts) does the fetching.
//
// SAFETY: the post is third-party text, data and never instructions. This
// reads names, places, dates and links out of it and nothing else.

import { computeId, isSameOccurrence, localDate, normVenue, venueParent } from "./dedup.js";
import { TRIANGLE_CITIES, isInMetro, type IngestWindow } from "./feeds.js";
import { nyIso } from "./render.js";
import type { EventSource, TriangleEvent } from "./types.js";

// --- Atom ------------------------------------------------------------------

/** One post from the author's Atom feed. `content` is the post body as HTML. */
export interface RedditPost {
  title: string;
  url: string;
  /** ISO-8601 as the feed gave it (UTC). */
  published: string;
  content: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the XML/HTML entities Reddit emits (named, decimal, hex). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    const b = body.toLowerCase();
    if (b.startsWith("#x")) return String.fromCodePoint(parseInt(b.slice(2), 16));
    if (b.startsWith("#")) return String.fromCodePoint(parseInt(b.slice(1), 10));
    return ENTITIES[b] ?? m;
  });
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1]! : null;
}

/**
 * Every `<entry>` of a Reddit Atom feed. Throws when the body is not an Atom
 * document at all — Reddit answers a rate-limited or blocked request with an
 * HTML login page and a 200, and that must surface as a failure, not as an
 * author who posted nothing this week.
 */
export function parseRedditAtom(raw: string): RedditPost[] {
  if (!/<feed[\s>]/i.test(raw) || !/http:\/\/www\.w3\.org\/2005\/Atom/.test(raw)) {
    throw new Error("not an Atom feed (no <feed xmlns=\"http://www.w3.org/2005/Atom\"> root)");
  }
  const posts: RedditPost[] = [];
  for (const m of raw.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]!;
    const link = e.match(/<link[^>]*\shref="([^"]*)"/i);
    posts.push({
      title: decodeEntities(tag(e, "title") ?? "").trim(),
      url: decodeEntities(link?.[1] ?? ""),
      published: (tag(e, "published") ?? tag(e, "updated") ?? "").trim(),
      content: decodeEntities(tag(e, "content") ?? ""),
    });
  }
  return posts;
}

const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The newest post whose title contains `titleMatch` (case and punctuation aside), or null. */
export function pickWeekendPost(posts: RedditPost[], titleMatch: string): RedditPost | null {
  const needle = fold(titleMatch);
  const hits = posts.filter((p) => fold(p.title).includes(needle));
  hits.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
  return hits[0] ?? null;
}

// --- Dates -----------------------------------------------------------------

export type WeekendDay = "Friday" | "Saturday" | "Sunday";
export const WEEKEND_DAYS: readonly WeekendDay[] = ["Friday", "Saturday", "Sunday"];

function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The dates the post's day headings mean. The post goes up Thursday or Friday
 * for the weekend ahead, and the odd Saturday repost still means the weekend
 * under way — so Saturday and Sunday look BACK to Friday, every other day looks
 * forward. The post date is read in America/New_York: 03:30Z on a Saturday is
 * still Friday night in Raleigh.
 */
export function weekendDates(publishedIso: string): Record<WeekendDay, string> {
  const ymd = localDate(publishedIso);
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const toFriday = weekday === 6 ? -1 : weekday === 0 ? -2 : (5 - weekday + 7) % 7;
  const friday = shiftDate(ymd, toFriday);
  return { Friday: friday, Saturday: shiftDate(friday, 1), Sunday: shiftDate(friday, 2) };
}

// --- Post body -------------------------------------------------------------

export interface Lead {
  day: WeekendDay;
  /** YYYY-MM-DD in America/New_York. */
  local_date: string;
  name: string;
  venue: string;
  city: string;
  /** The primary page the post links to — where the event gets built from. */
  url: string;
}

const stripTags = (html: string): string => html.replace(/<[^>]+>/g, " ");
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();
const isTriangleTown = (s: string): boolean => TRIANGLE_CITIES.includes(s.trim().toLowerCase());

/** One `<li>` into a lead, or null when it carries no link. */
function parseItem(li: string, day: WeekendDay, date: string): Lead | null {
  const a = li.match(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>([\s\S]*)$/i);
  if (!a) return null;
  // An href with a space in it is the author's paste ("URL Venue"); the URL is
  // the first token.
  const url = decodeEntities(a[1]!).trim().split(/\s+/)[0] ?? "";
  const name = squash(decodeEntities(stripTags(a[2]!)));
  if (url === "" || name === "") return null;
  const rest = squash(decodeEntities(stripTags(a[3]!))).replace(/^[,\s]+/, "");
  const segs = rest
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  let venue = "";
  let city = "";
  if (segs.length >= 2) {
    city = segs[segs.length - 1]!;
    venue = segs.slice(0, -1).join(", ");
  } else if (segs.length === 1) {
    if (isTriangleTown(segs[0]!)) city = segs[0]!;
    else venue = segs[0]!;
  }
  return { day, local_date: date, name, venue, city, url };
}

/**
 * The post's day sections into leads, in listing order. Only `<ul>` blocks that
 * follow a Friday/Saturday/Sunday heading count, which is what keeps the footer
 * (newsletter sign-up, "submitted by", "[comments]") out.
 */
export function parseWeekendPost(post: RedditPost): Lead[] {
  const dates = weekendDates(post.published);
  const leads: Lead[] = [];
  const section = /<p>\s*(Friday|Saturday|Sunday)\s*<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi;
  for (const m of post.content.matchAll(section)) {
    const day = (m[1]![0]!.toUpperCase() + m[1]!.slice(1).toLowerCase()) as WeekendDay;
    for (const li of m[2]!.matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
      const lead = parseItem(li[1]!, day, dates[day]);
      if (lead) leads.push(lead);
    }
  }
  return leads;
}

// --- Ingest ----------------------------------------------------------------

/** A lead as the draft event it would become, for `computeId` / `isSameOccurrence`. */
function leadEvent(lead: Lead, start: string): TriangleEvent {
  return {
    id: "",
    name: lead.name,
    category: "unknown",
    tags: [],
    venue: lead.venue === "" ? "unknown" : lead.venue,
    address: "unknown",
    city: lead.city,
    lat: null,
    lon: null,
    start,
    end: "",
    duration_min: null,
    price: "unknown",
    budget: "unknown",
    indoor_outdoor: "indoor",
    vegan: "unknown",
    vegetarian: "unknown",
    weather: null,
    image_url: "unknown",
    booking_url: "unknown",
    info_url: lead.url,
    source: lead.url,
    first_seen: start,
    last_verified: start,
  };
}

/**
 * The id the event built from this lead will get, so a lead can be matched to
 * the store before anyone opens its link. `computeId` hashes the local DATE,
 * not the time, so a placeholder noon start yields the real id.
 */
export function leadId(lead: Lead): string {
  const [y, m, d] = lead.local_date.split("-").map(Number) as [number, number, number];
  return computeId(leadEvent(lead, nyIso(y, m, d, 12, 0)));
}

export interface LeadsDropped {
  out_of_metro: number;
  out_of_window: number;
  already_in_store: number;
}

export interface LeadsIngestResult {
  /** The post that was read, or null when none matched. */
  post_url: string | null;
  published: string | null;
  leads: Lead[];
  dropped: LeadsDropped;
  /** Source-level failures. Non-empty means "this source failed", not "no leads". */
  errors: string[];
}

export interface LeadsIngestOptions {
  /** Keep only leads dated inside the window. Omit to keep every day. */
  window?: IngestWindow;
  /** The current data/events.json events; leads it already covers are dropped. */
  store?: TriangleEvent[];
}

/**
 * True when the store already has this lead's occurrence: the same id, or an
 * event the dedup rules (CLAUDE.md § Dedup 2) would merge it into. The lead
 * has no time, so the ±90-minute test is run at the stored event's own start —
 * venue and title still have to match, and only on the same local date.
 */
function inStore(lead: Lead, id: string, ids: Set<string>, byDate: Map<string, TriangleEvent[]>): boolean {
  if (ids.has(id)) return true;
  for (const ev of byDate.get(lead.local_date) ?? []) {
    if (isSameOccurrence(leadEvent(lead, ev.start), ev)) return true;
  }
  return false;
}

/**
 * Parse one already-fetched Atom body into the leads the store is missing.
 * Drops, in order: leads outside the Triangle, outside the window, and ones the
 * store already has.
 */
export function ingestLeads(source: EventSource, raw: string, opts: LeadsIngestOptions = {}): LeadsIngestResult {
  const dropped: LeadsDropped = { out_of_metro: 0, out_of_window: 0, already_in_store: 0 };
  const label = `source "${source.id}"`;
  const fail = (msg: string): LeadsIngestResult => ({ post_url: null, published: null, leads: [], dropped, errors: [msg] });

  const hint = source.ingest;
  if (!hint || hint.mode !== "leads") return fail(`${label}: no lead list declared (set ingest.mode = "leads")`);

  let posts: RedditPost[];
  try {
    posts = parseRedditAtom(raw);
  } catch (e) {
    return fail(`${label}: ${hint.feed_url} did not serve an Atom feed — ${(e as Error).message}`);
  }
  const post = pickWeekendPost(posts, hint.title_match);
  if (!post) {
    return fail(`${label}: none of the ${posts.length} post(s) in ${hint.feed_url} has "${hint.title_match}" in its title`);
  }

  const ids = new Set((opts.store ?? []).map((e) => e.id));
  const byDate = new Map<string, TriangleEvent[]>();
  for (const ev of opts.store ?? []) {
    const d = localDate(ev.start);
    byDate.set(d, [...(byDate.get(d) ?? []), ev]);
  }
  const from = opts.window ? localDate(opts.window.start) : null;
  const to = opts.window ? localDate(opts.window.end) : null;

  const leads: Lead[] = [];
  for (const lead of parseWeekendPost(post)) {
    const place = { lat: null, lon: null, city: lead.city, location: lead.venue };
    if (!isInMetro(place, source.city, { scope: "traveling" })) {
      dropped.out_of_metro++;
      continue;
    }
    if ((from && lead.local_date < from) || (to && lead.local_date > to)) {
      dropped.out_of_window++;
      continue;
    }
    if (inStore(lead, leadId(lead), ids, byDate)) {
      dropped.already_in_store++;
      continue;
    }
    leads.push(lead);
  }
  return { post_url: post.url, published: post.published, leads, dropped, errors: [] };
}

// --- Venue ranking ----------------------------------------------------------

export interface VenueRank {
  /** Lower-cased venue as the posts write it, leading "the" dropped. */
  venue: string;
  city: string;
  /** How many weekly posts list it. */
  weeks: number;
  /** How many listings across those posts. */
  events: number;
  /** The registrable host its listings link to most often. */
  domain: string;
  /** True when data/sources.json already covers it, by name, alias or link domain. */
  in_registry: boolean;
}

const venueKey = (v: string): string => squash(v.toLowerCase()).replace(/^the\s+/, "");

function host(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function mode(counts: Map<string, number>): string {
  let best = "";
  let n = -1;
  for (const [k, v] of counts) if (v > n) [best, n] = [k, v];
  return best;
}

/**
 * Which venues the weekly posts keep listing that the registry does not know —
 * the evidence for adding a source. Every matching post in `posts` counts,
 * so the ranking spans the feed's whole history, not just this week.
 */
export function rankVenues(posts: RedditPost[], titleMatch: string, registry: EventSource[]): VenueRank[] {
  const known = new Set<string>();
  const knownHosts = new Set<string>();
  for (const s of registry) {
    for (const n of [s.name, ...(s.venue_aliases ?? [])]) {
      known.add(venueKey(n));
      known.add(normVenue(n));
    }
    knownHosts.add(host(s.url));
    if (s.ingest && "feed_url" in s.ingest) knownHosts.add(host(s.ingest.feed_url));
  }
  // The posts write a hall as "Hall at Complex" and use the dedup alias map's
  // shorthands ("DBAP"), so a venue is covered when any of its forms — whole,
  // either side of " at ", canonicalised — is a registry name/alias, or when
  // the registry has the complex a hall belongs to.
  const covered = (venue: string): boolean => {
    const forms = [venue, ...venue.split(/\s+(?:at|@)\s+/i)];
    for (const f of forms) {
      const key = venueKey(f);
      const canon = normVenue(f);
      if (known.has(key) || known.has(canon)) return true;
      const parent = venueParent(f);
      if (parent !== null && known.has(parent)) return true;
    }
    return false;
  };
  const needle = fold(titleMatch);
  type Acc = { weeks: Set<string>; events: number; cities: Map<string, number>; hosts: Map<string, number> };
  const acc = new Map<string, Acc>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const post of posts) {
    if (!fold(post.title).includes(needle)) continue;
    for (const lead of parseWeekendPost(post)) {
      if (lead.venue === "") continue;
      const key = venueKey(lead.venue);
      const a = acc.get(key) ?? { weeks: new Set(), events: 0, cities: new Map(), hosts: new Map() };
      a.weeks.add(post.url);
      a.events++;
      if (lead.city !== "") bump(a.cities, lead.city);
      const h = host(lead.url);
      if (h !== "") bump(a.hosts, h);
      acc.set(key, a);
    }
  }
  const rows: VenueRank[] = [];
  for (const [venue, a] of acc) {
    const domain = mode(a.hosts);
    rows.push({
      venue,
      city: mode(a.cities),
      weeks: a.weeks.size,
      events: a.events,
      domain,
      in_registry: covered(venue) || (domain !== "" && knownHosts.has(domain)),
    });
  }
  rows.sort((x, y) => y.weeks - x.weeks || y.events - x.events || x.venue.localeCompare(y.venue));
  return rows;
}
