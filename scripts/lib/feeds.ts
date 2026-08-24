// Feed ingestion for registry sources that publish a machine-readable calendar
// (data/sources.json § ingest). Turns an ICS or Localist JSON response into
// draft TriangleEvent records so those sources stop being scraped — and stop
// reporting false zeros.
//
// Pure: no fs, no network, no DOM. Everything here takes the already-fetched
// response body as a string, so it is unit-testable against the committed
// fixtures in scripts/fixtures/. The weekly run does the fetching.
//
// The records this produces are DRAFTS. `category`, `indoor_outdoor`, `budget`,
// `lat`/`lon` and `weather` are placeholders no feed carries — the run's
// enrichment + verification steps (prompts/weekly.md steps 5-6) still own them.
// What the feed does give, and scraping does not, is an exact start time and a
// stable identity.
//
// NOT supported, on purpose: RSS/Atom. See FEED_TYPES in types.ts.

import { computeId } from "./dedup.js";
import {
  FEED_TYPES,
  type EventSource,
  type FeedScope,
  type FeedType,
  type Origin,
  type TriangleEvent,
} from "./types.js";

const TZID = "America/New_York";

/** Downtown Raleigh — the pipeline's origin (mirrors data/events.json envelope). */
export const TRIANGLE_ORIGIN: Origin = { name: "Downtown Raleigh, NC", lat: 35.7796, lon: -78.6382 };

/**
 * Great-circle miles from the origin that still count as a same-day Triangle
 * outing. 40 clears the furthest towns CLAUDE.md § Coverage names (Hillsborough
 * ~33 mi, Pittsboro ~31 mi) with margin, and stays well short of Fayetteville
 * (~60), Greensboro (~72) and Winston-Salem (~100).
 */
export const METRO_RADIUS_MILES = 40;

/**
 * Towns that count as Triangle metro: the ones CLAUDE.md § Coverage names, plus
 * the inner Wake/Orange ring already present in data/events.json. Used only when
 * an item has no coordinates — where lat/lon exist, the radius decides.
 */
export const TRIANGLE_CITIES: readonly string[] = [
  "raleigh", "durham", "chapel hill", "cary", "apex", "morrisville", "wake forest",
  "hillsborough", "pittsboro", "carrboro", "garner", "holly springs", "fuquay-varina",
  "knightdale", "wendell", "zebulon", "rolesville", "clayton",
];

// US state names + postal codes + the AP abbreviations sports feeds use. Their
// only job is to answer "does this line name a state other than North Carolina",
// which is what keeps Durham, N.H. from passing as Durham, N.C.
const NC_TOKENS = new Set(["nc", "n c", "north carolina"]);
const STATE_TOKENS = new Set([
  "al", "ala", "alabama", "ak", "alaska", "az", "ariz", "arizona", "ar", "ark", "arkansas",
  "ca", "calif", "california", "co", "colo", "colorado", "ct", "conn", "connecticut",
  "de", "del", "delaware", "dc", "d c", "district of columbia", "fl", "fla", "florida",
  "ga", "georgia", "hi", "hawaii", "id", "idaho", "il", "ill", "illinois", "in", "ind", "indiana",
  "ia", "iowa", "ks", "kan", "kans", "kansas", "ky", "kentucky", "la", "louisiana",
  "me", "maine", "md", "maryland", "ma", "mass", "massachusetts", "mi", "mich", "michigan",
  "mn", "minn", "minnesota", "ms", "miss", "mississippi", "mo", "missouri", "mt", "mont", "montana",
  "ne", "neb", "nebr", "nebraska", "nv", "nev", "nevada", "nh", "n h", "new hampshire",
  "nj", "n j", "new jersey", "nm", "n m", "new mexico", "ny", "n y", "new york",
  "nc", "n c", "north carolina", "nd", "n d", "north dakota", "oh", "ohio", "ok", "okla", "oklahoma",
  "or", "ore", "oregon", "pa", "penn", "pennsylvania", "ri", "r i", "rhode island",
  "sc", "s c", "south carolina", "sd", "s d", "south dakota", "tn", "tenn", "tennessee",
  "tx", "texas", "ut", "utah", "vt", "vermont", "va", "virginia", "wa", "wash", "washington",
  "wv", "w va", "west virginia", "wi", "wis", "wisc", "wisconsin", "wy", "wyo", "wyoming",
]);

// Feeds write these where a location is missing rather than omitting the field.
const PLACEHOLDER_LOCATIONS = new Set(["", "none", "n/a", "na", "tba", "tbd", "unknown"]);

/** One feed entry, before it is mapped onto the event schema. */
export interface FeedItem {
  uid: string;
  title: string;
  /** ISO-8601 with an America/New_York offset, or null when the feed gave none. */
  start: string | null;
  end: string | null;
  /** Free-text location line as the feed wrote it ("" when absent). */
  location: string;
  /** Explicit city, when the feed carries one separately from `location`. */
  city: string;
  address: string;
  lat: number | null;
  lon: number | null;
  price: string;
  url: string;
  image_url: string;
  booking_url: string;
  description: string;
}

function emptyItem(): FeedItem {
  return {
    uid: "", title: "", start: null, end: null, location: "", city: "", address: "",
    lat: null, lon: null, price: "", url: "", image_url: "", booking_url: "", description: "",
  };
}

// --- ICS reading -----------------------------------------------------------

/** Split an ICS body into logical lines, rejoining RFC 5545 folded continuations. */
export function unfoldIcsLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r\n|\n|\r/)) {
    if (raw.startsWith(" ") || raw.startsWith("\t")) {
      if (out.length > 0) out[out.length - 1] += raw.slice(1);
      continue;
    }
    if (raw.trim() === "") continue;
    out.push(raw);
  }
  return out;
}

/** Reverse of ics.ts § escapeText — RFC 5545 §3.3.11. */
export function unescapeIcsText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_m, ch: string) => (ch === "n" || ch === "N" ? "\n" : ch));
}

/**
 * Some feeds HTML-escape the ampersands in a URL property (goheels ships
 * `...game_id=26998&amp;sport_id=22`), which yields a bogus `amp;sport_id` param.
 */
function decodeUrl(value: string): string {
  return value.replace(/&amp;/g, "&").trim();
}

interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseIcsLine(line: string): IcsProperty | null {
  // Split at the first colon that is not inside a quoted parameter value.
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    params[p.slice(0, eq).trim().toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: (name ?? "").trim().toUpperCase(), params, value };
}

/** Wall-clock offset of `tz` at a given instant, in ms. */
function zoneOffsetMs(instant: number, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(instant))) p[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  );
  return asUtc - instant;
}

/** The instant at which `tz`'s wall clock reads the given components. */
function wallTimeToInstant(parts: number[], tz: string): number {
  const [y, mo, d, h, mi, s] = parts as [number, number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes: the first offset is read at the wrong instant near a DST edge.
  let instant = asUtc - zoneOffsetMs(asUtc, tz);
  instant = asUtc - zoneOffsetMs(instant, tz);
  return instant;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** An instant rendered as ISO-8601 with the America/New_York offset. */
export function toEasternIso(instant: number): string {
  const offsetMs = zoneOffsetMs(instant, TZID);
  const local = new Date(instant + offsetMs);
  const sign = offsetMs < 0 ? "-" : "+";
  const offMin = Math.abs(Math.round(offsetMs / 60000));
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(offMin / 60))}:${pad(offMin % 60)}`
  );
}

/**
 * An ICS DATE / DATE-TIME value -> ISO-8601 in America/New_York, or null when it
 * isn't a stamp at all. A trailing `Z` is UTC; otherwise the value is a wall time
 * in `params.TZID` (defaulting to the pipeline's own zone, which is also what an
 * unrecognized TZID falls back to).
 */
export function icsToEasternIso(value: string, params: Record<string, string> = {}): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  const instant = m[7]
    ? Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!, parts[3]!, parts[4]!, parts[5]!)
    : wallTimeToInstant(parts, zoneOrDefault(params.TZID));
  return Number.isNaN(instant) ? null : toEasternIso(instant);
}

function zoneOrDefault(tz: string | undefined): string {
  if (!tz) return TZID;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return TZID;
  }
}

/** `PT1H30M` / `P2DT1H` -> minutes. Returns null for anything else. */
function durationMinutes(value: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m || value.trim() === "P") return null;
  const [, w, d, h, mi, s] = m;
  const total =
    Number(w ?? 0) * 10080 + Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(mi ?? 0) + Number(s ?? 0) / 60;
  return total > 0 ? total : null;
}

function cleanLocation(value: string): string {
  const trimmed = value.trim();
  return PLACEHOLDER_LOCATIONS.has(trimmed.toLowerCase()) ? "" : trimmed;
}

/** Every VEVENT in an ICS body, in feed order. Items may have `start: null`. */
export function parseIcsFeed(text: string): FeedItem[] {
  const items: FeedItem[] = [];
  let current: IcsProperty[] | null = null;

  for (const line of unfoldIcsLines(text)) {
    const upper = line.toUpperCase();
    if (upper.startsWith("BEGIN:VEVENT")) {
      current = [];
      continue;
    }
    if (upper.startsWith("END:VEVENT")) {
      if (current) items.push(icsPropsToItem(current));
      current = null;
      continue;
    }
    if (!current) continue;
    const prop = parseIcsLine(line);
    if (prop) current.push(prop);
  }
  return items;
}

function icsPropsToItem(props: IcsProperty[]): FeedItem {
  const first = (name: string): IcsProperty | undefined => props.find((p) => p.name === name);
  const item = emptyItem();

  item.uid = first("UID")?.value.trim() ?? "";
  item.title = unescapeIcsText(first("SUMMARY")?.value ?? "").trim();
  item.description = unescapeIcsText(first("DESCRIPTION")?.value ?? "").trim();
  item.location = cleanLocation(unescapeIcsText(first("LOCATION")?.value ?? ""));
  item.url = decodeUrl(first("URL")?.value ?? "");

  const dtstart = first("DTSTART");
  item.start = dtstart ? icsToEasternIso(dtstart.value, dtstart.params) : null;

  const dtend = first("DTEND");
  if (dtend) {
    item.end = icsToEasternIso(dtend.value, dtend.params);
  } else if (item.start) {
    const mins = durationMinutes(first("DURATION")?.value ?? "");
    if (mins !== null) item.end = toEasternIso(new Date(item.start).getTime() + mins * 60000);
  }

  const geo = first("GEO")?.value.split(";") ?? [];
  const lat = Number(geo[0]);
  const lon = Number(geo[1]);
  if (geo.length === 2 && Number.isFinite(lat) && Number.isFinite(lon)) {
    item.lat = lat;
    item.lon = lon;
  }
  return item;
}

// --- Localist reading ------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * A Localist `/api/2/events` response. One FeedItem per event INSTANCE, so a
 * recurring series stays a series of distinct occurrences (CLAUDE.md § Dedup).
 * Throws on a body that isn't JSON — a 403 HTML page is a failed fetch, not an
 * empty calendar, and the run should say so.
 */
export function parseLocalistFeed(raw: string): FeedItem[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new Error(`localist: response is not JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  const wrappers = (doc as { events?: unknown }).events;
  if (!Array.isArray(wrappers)) throw new Error("localist: response has no `events` array");

  const items: FeedItem[] = [];
  for (const wrapper of wrappers) {
    const e = (wrapper as { event?: Record<string, unknown> })?.event;
    if (!e || typeof e !== "object") continue;

    const geo = (e.geo ?? {}) as Record<string, unknown>;
    const ticketCost = str(e.ticket_cost);
    const base = emptyItem();
    base.title = str(e.title);
    base.location = cleanLocation(str(e.location_name));
    base.city = str(geo.city);
    base.address = str(e.address);
    base.lat = num(geo.latitude);
    base.lon = num(geo.longitude);
    // An explicit cost string beats the `free` checkbox: sources set both, and
    // the string is the one that says "Adult $18".
    base.price = ticketCost !== "" ? ticketCost : e.free === true ? "Free" : "";
    base.url = str(e.url) || str(e.localist_url);
    base.image_url = str(e.photo_url);
    base.booking_url = str(e.ticket_url);
    base.description = str(e.description_text);

    const instances = Array.isArray(e.event_instances) ? e.event_instances : [];
    for (const wrapped of instances) {
      const inst = (wrapped as { event_instance?: Record<string, unknown> })?.event_instance;
      const start = str(inst?.start);
      if (start === "") continue;
      const startMs = new Date(start).getTime();
      if (Number.isNaN(startMs)) continue;
      const endMs = new Date(str(inst?.end)).getTime();
      items.push({
        ...base,
        uid: `${str(e.id) || String(e.id ?? "")}-${str(inst?.id) || String(inst?.id ?? "")}`,
        start: toEasternIso(startMs),
        end: Number.isNaN(endMs) ? null : toEasternIso(endMs),
      });
    }
  }
  return items;
}

// --- The WordPress /feed/ trap ---------------------------------------------

/**
 * True when a body is an RSS/Atom document. Those are never event feeds here:
 * every Triangle venue that advertises `<link rel="alternate">` serves its
 * WordPress *blog* feed — auditions, press releases, "Job Opening — Marketing
 * Manager". Wiring one in would file job postings as events.
 */
export function looksLikeSyndicationFeed(raw: string): boolean {
  const head = raw.slice(0, 4096).replace(/^﻿/, "").trimStart();
  if (!head.startsWith("<")) return false;
  return /<(rss\b|feed\b|rdf:RDF\b)/i.test(head);
}

// --- Radius filter ---------------------------------------------------------

function normPlace(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // trailing venue parentheticals
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTriangleCity(text: string): boolean {
  return TRIANGLE_CITIES.includes(normPlace(text));
}

/** True when a Triangle city name appears as a whole phrase inside `text`. */
function namesTriangleCity(text: string): boolean {
  const norm = ` ${normPlace(text)} `;
  return TRIANGLE_CITIES.some((c) => norm.includes(` ${c} `));
}

function isStateToken(text: string): boolean {
  return STATE_TOKENS.has(normPlace(text));
}

function isNonNcState(text: string): boolean {
  const norm = normPlace(text);
  return STATE_TOKENS.has(norm) && !NC_TOKENS.has(norm);
}

function segments(location: string): string[] {
  return location.split(",").map((s) => s.trim()).filter((s) => s !== "");
}

const R_MILES = 3958.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle miles. (site/src/lib/distance.ts keeps a copy for the browser.) */
export function haversineMiles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(h));
}

/** What a feed tells us about where an item happens. */
export interface PlaceHint {
  lat: number | null;
  lon: number | null;
  city: string;
  location: string;
}

export interface MetroOptions {
  /** How far the feed ranges. See FEED_SCOPES in types.ts. Defaults to "local". */
  scope?: FeedScope;
  origin?: Origin;
}

/**
 * Is this item a same-day Triangle outing? Both supported feeds are far broader
 * than the metro — DNCR is statewide (Chimney Rock, Elk Knob), goheels is a
 * whole season of away games — and a title is no guide, since goheels lists
 * neutral-site games as "vs".
 *
 * Evidence, strongest first:
 *  1. coordinates — decisive, `METRO_RADIUS_MILES` from the origin;
 *  2. an explicit city field;
 *  3. a state other than NC anywhere in the location line — decisive against,
 *     and checked BEFORE any city match, because "Durham, N.H." is UNH;
 *  4. a Triangle city named in the line;
 *  5. an NC token but no Triangle city — the line designates a place, and it
 *     isn't one of ours ("Winston-Salem, NC", "Charlotte, N.C.");
 *  6. no place at all — "Duke South, Room M224" is a room, not a city. Whether
 *     that inherits the source's city is exactly what `scope` decides.
 */
export function isInMetro(place: PlaceHint, sourceCity: string, opts: MetroOptions = {}): boolean {
  const origin = opts.origin ?? TRIANGLE_ORIGIN;
  if (place.lat !== null && place.lon !== null && Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
    return haversineMiles(origin.lat, origin.lon, place.lat, place.lon) <= METRO_RADIUS_MILES;
  }
  if (place.city.trim() !== "") return isTriangleCity(place.city);

  const segs = segments(place.location);
  if (segs.some(isNonNcState)) return false;
  // Exact per-segment, not "contains": "Wake Forest University, Winston-Salem"
  // names a Triangle town it is nowhere near.
  if (segs.some(isTriangleCity)) return true;
  if (segs.length === 1 && namesTriangleCity(segs[0]!)) return true;
  if (segs.some(isStateToken)) return false;
  if ((opts.scope ?? "local") === "traveling") return false;
  return isTriangleCity(sourceCity);
}

// --- Ingest ----------------------------------------------------------------

export interface IngestWindow {
  /** ISO-8601, inclusive. */
  start: string;
  end: string;
}

export interface IngestOptions {
  /** ISO-8601 "now" — stamped as `first_seen` / `last_verified`. */
  now: string;
  /** Restrict to events starting inside the window. Omit to keep every item. */
  window?: IngestWindow;
  origin?: Origin;
}

export interface IngestDropped {
  no_start: number;
  no_title: number;
  out_of_metro: number;
  out_of_window: number;
  duplicate: number;
}

export interface FeedIngestResult {
  events: TriangleEvent[];
  dropped: IngestDropped;
  /** Feed-level failures. A non-empty list means "this source failed", not "zero events". */
  errors: string[];
}

function parseByType(type: FeedType, raw: string): FeedItem[] {
  return type === "localist" ? parseLocalistFeed(raw) : parseIcsFeed(raw);
}

/** The venue half of an ICS location line, with the city/state slots removed. */
function venueFromLocation(location: string): string {
  const segs = segments(location);
  if (segs.length === 0) return "";
  if (segs.length === 1) return isTriangleCity(segs[0]!) ? "" : segs[0]!;
  const rest = segs.slice(1).filter((s) => !isStateToken(s));
  if (isTriangleCity(segs[0]!)) return rest.join(", ");
  return segs.join(", ");
}

function cityFromItem(item: FeedItem, sourceCity: string): string {
  if (item.city.trim() !== "") return item.city.trim();
  const segs = segments(item.location);
  if (segs.length > 0 && isTriangleCity(segs[0]!)) return segs[0]!;
  return sourceCity;
}

const orUnknown = (v: string): string => (v.trim() === "" ? "unknown" : v.trim());

function toEvent(item: FeedItem, source: EventSource, now: string): TriangleEvent {
  const start = item.start!;
  const city = cityFromItem(item, source.city);
  const venue = orUnknown(item.location !== "" ? venueFromLocation(item.location) : "");
  const startMs = new Date(start).getTime();
  const endMs = item.end ? new Date(item.end).getTime() : NaN;

  const ev: TriangleEvent = {
    id: "",
    name: item.title,
    // No feed carries our taxonomy; the source's own first category is the
    // honest default, and enrichment refines it.
    category: source.categories?.[0] ?? "unknown",
    tags: [],
    venue,
    address: orUnknown(item.address),
    city,
    lat: item.lat,
    lon: item.lon,
    start,
    end: Number.isNaN(endMs) ? "" : item.end!,
    duration_min: Number.isNaN(endMs) ? null : Math.round((endMs - startMs) / 60000),
    price: orUnknown(item.price),
    budget: item.price.trim().toLowerCase() === "free" ? "$" : "unknown",
    // Placeholders: no feed says. Enrichment (weekly.md step 5) confirms both,
    // and an outdoor event still needs a forecast before it ships.
    indoor_outdoor: "indoor",
    vegan: "unknown",
    vegetarian: "unknown",
    weather: null,
    image_url: orUnknown(item.image_url),
    booking_url: orUnknown(item.booking_url),
    info_url: orUnknown(item.url || source.url),
    source: source.url,
    first_seen: now,
    last_verified: now,
  };
  if (item.description !== "") ev.description = item.description;
  ev.id = computeId(ev);
  return ev;
}

/**
 * Parse one already-fetched feed body into draft events for `source`.
 *
 * Drops, in order: items with no start timestamp (the rule that keeps a blog
 * feed's job postings out), untitled items, items outside the Triangle, items
 * outside the date window, and same-`id` repeats — both an unnamed event and a
 * duplicate id are hard `npm run validate` errors, so neither leaves here.
 */
export function ingestFeed(source: EventSource, raw: string, opts: IngestOptions): FeedIngestResult {
  const dropped: IngestDropped = { no_start: 0, no_title: 0, out_of_metro: 0, out_of_window: 0, duplicate: 0 };
  const errors: string[] = [];
  const label = `source "${source.id}"`;

  const hint = source.ingest;
  if (!hint || hint.mode !== "feed") {
    return { events: [], dropped, errors: [`${label}: no feed declared (set ingest.mode = "feed")`] };
  }
  if (!FEED_TYPES.includes(hint.feed_type)) {
    return { events: [], dropped, errors: [`${label}: unknown feed_type "${hint.feed_type}"`] };
  }
  if (looksLikeSyndicationFeed(raw)) {
    return {
      events: [],
      dropped,
      errors: [
        `${label}: ${hint.feed_url} served an RSS/Atom document, not a ${hint.feed_type} feed — ` +
          `this is almost always a WordPress blog feed (press releases, auditions, job openings), ` +
          `not an event feed. Do not wire it up.`,
      ],
    };
  }

  let items: FeedItem[];
  try {
    items = parseByType(hint.feed_type, raw);
  } catch (err) {
    return { events: [], dropped, errors: [`${label}: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const windowStart = opts.window ? new Date(opts.window.start).getTime() : null;
  const windowEnd = opts.window ? new Date(opts.window.end).getTime() : null;
  const events: TriangleEvent[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!item.start) {
      dropped.no_start++;
      continue;
    }
    if (item.title === "") {
      dropped.no_title++;
      continue;
    }
    const place: PlaceHint = { lat: item.lat, lon: item.lon, city: item.city, location: item.location };
    if (!isInMetro(place, source.city, { scope: hint.feed_scope, origin: opts.origin })) {
      dropped.out_of_metro++;
      continue;
    }
    if (windowStart !== null && windowEnd !== null) {
      const startMs = new Date(item.start).getTime();
      if (startMs < windowStart || startMs > windowEnd) {
        dropped.out_of_window++;
        continue;
      }
    }
    const ev = toEvent(item, source, opts.now);
    if (seen.has(ev.id)) {
      dropped.duplicate++;
      continue;
    }
    seen.add(ev.id);
    events.push(ev);
  }

  return { events, dropped, errors };
}
