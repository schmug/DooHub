// Browser-render ingestion for registry sources whose listings a plain fetch
// cannot see (data/sources.json § ingest, mode "render"). The sibling of
// scripts/lib/feeds.ts: same job, same output shape, different failure mode —
// feeds.ts reads sources that publish structured data, this one reads sources
// that publish nothing a script can reach.
//
// Pure: no fs, no network, no DOM. Everything takes the already-rendered page as
// a string, so it is unit-testable against the committed fixtures in
// scripts/fixtures/. scripts/render_source.ts does the rendering.
//
// Two strategies, in that order of preference:
//   json-ld  schema.org Event blocks. Near 1:1 with the event schema, so it is
//            the reliable path (Bandsintown publishes 30 MusicEvent blocks).
//   text     the rendered text of the listing, for pages carrying no event
//            JSON-LD at all. Lenovo Center has exactly one ld+json block and it
//            is an Organization, so a JSON-LD-only path leaves it at zero.
//
// Like feeds.ts, the records here are DRAFTS: `category`, `indoor_outdoor`,
// `budget` and `weather` are placeholders no listing carries, and the run's
// enrichment + verification steps (prompts/weekly.md steps 5-6) still own them.
//
// SAFETY: a rendered page is third-party data, never instructions. Nothing here
// interprets what a page says; it reads names, dates, links and images out of it.

import { computeId } from "./dedup.js";
import {
  isInMetro,
  toEasternIso,
  type FeedItem,
  type IngestDropped,
  type IngestOptions,
} from "./feeds.js";
import { RENDER_EXTRACTS, type EventSource, type RenderExtract, type TriangleEvent } from "./types.js";

const TZID = "America/New_York";

/**
 * One listing row, before it becomes an event. Extends feeds.ts's `FeedItem` so
 * both ingest paths converge on the same draft-building step; `uid` is unused
 * here (a listing has no feed identity — `computeId` supplies it).
 */
export interface RenderItem extends FeedItem {
  /** False when the listing gave a date but no clock time, so `start` is midnight. */
  start_time_known: boolean;
}

/** Which strategy actually produced a page's items. */
export type ResolvedExtract = Exclude<RenderExtract, "auto">;

export interface RenderIngestResult {
  events: TriangleEvent[];
  /** The strategy used, or null when the page was never read. */
  extract: ResolvedExtract | null;
  dropped: IngestDropped;
  /** Source-level failures. A non-empty list means "this source failed", not "zero events". */
  errors: string[];
  /** Non-fatal notes worth a human's eye in the run summary. */
  warnings: string[];
}

// --- America/New_York wall-clock helpers -------------------------------------

const NY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TZID,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface NyFields {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

/** The America/New_York wall clock at an instant. */
export function nyFields(instant: Date): NyFields {
  const p: Record<string, string> = {};
  for (const part of NY_PARTS.formatToParts(instant)) p[part.type] = part.value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour),
    mm: Number(p.minute),
    ss: Number(p.second),
  };
}

function nyOffsetMs(instant: number): number {
  const f = nyFields(new Date(instant));
  return Date.UTC(f.y, f.m - 1, f.d, f.hh, f.mm, f.ss) - instant;
}

/**
 * An America/New_York wall clock as an ISO-8601 stamp carrying the offset that
 * is actually in effect then. Two passes, so a time near a DST boundary resolves
 * to the offset on its own side of it.
 */
export function nyIso(y: number, m: number, d: number, hh: number, mm: number): string {
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  let instant = asUtc - nyOffsetMs(asUtc);
  instant = asUtc - nyOffsetMs(instant);
  return toEasternIso(instant);
}

const LOOSE_ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2})(?::(\d{2}))?(?::\d{2})?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

export interface ParsedStamp {
  iso: string;
  timeKnown: boolean;
}

/**
 * A schema.org date/time string as an Eastern stamp. Covers the three shapes
 * listings actually emit: naive venue-local ("2026-08-23T18:00:00", which is
 * what Bandsintown publishes), offset/UTC, and date-only.
 */
export function parseStamp(raw: unknown): ParsedStamp | null {
  if (typeof raw !== "string") return null;
  const m = LOOSE_ISO.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, zone] = m;
  if (zone) {
    const at = Date.parse(raw.trim());
    if (Number.isNaN(at)) return null;
    return { iso: toEasternIso(at), timeKnown: hh !== undefined };
  }
  return {
    iso: nyIso(Number(y), Number(mo), Number(d), Number(hh ?? 0), Number(mm ?? 0)),
    timeKnown: hh !== undefined,
  };
}

// --- JSON-LD -----------------------------------------------------------------

const LD_BLOCK = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;

function collectNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  out.push(obj);
  if (obj["@graph"] !== undefined) collectNodes(obj["@graph"], out);
}

/**
 * Every JSON-LD node on the page in DOCUMENT ORDER, `@graph` containers
 * flattened. Unparseable blocks are skipped — real pages carry truncated or
 * trailing-comma JSON, and the other blocks are still good.
 */
export function jsonLdNodes(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const match of html.matchAll(LD_BLOCK)) {
    try {
      collectNodes(JSON.parse(match[1]!), out);
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * SUBSTRING match, deliberately: schema.org's event types are all suffixed —
 * Bandsintown emits MusicEvent, ticketing sites emit TheaterEvent,
 * ScreeningEvent, SportsEvent. An `=== "Event"` test finds none of them.
 */
function isEventType(type: unknown): boolean {
  if (Array.isArray(type)) return type.some(isEventType);
  return typeof type === "string" && type.includes("Event");
}

function firstOf(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** An Offer's price as the schema's human string ("Free", "$15", "$10-$25"). */
function offerPrice(offer: Record<string, unknown> | null): string {
  if (!offer) return "";
  const raw = offer.price ?? offer.lowPrice;
  const low = num(raw);
  if (low === null) return str(raw);
  const currency = str(offer.priceCurrency).toUpperCase();
  if (currency !== "" && currency !== "USD") return `${low} ${currency}`;
  if (low === 0) return "Free";
  const high = num(offer.highPrice);
  return high !== null && high > low ? `${money(low)}-${money(high)}` : money(low);
}

function postalAddress(address: unknown): string {
  if (typeof address === "string") return address.trim();
  if (!address || typeof address !== "object") return "";
  const a = address as Record<string, unknown>;
  const parts = [str(a.streetAddress), str(a.addressLocality), str(a.addressRegion)].filter((p) => p !== "");
  if (parts.length === 0) return "";
  // "658 Maywood Ave, Raleigh, NC 27603" — the zip trails the region, uncomma'd.
  const zip = str(a.postalCode);
  const line = parts.join(", ");
  return zip === "" ? line : `${line} ${zip}`;
}

function imageUrl(image: unknown): string {
  const first = firstOf(image);
  if (typeof first === "string") return first.trim();
  if (first && typeof first === "object") return str((first as Record<string, unknown>).url);
  return "";
}

/** schema.org Event nodes on the page, in document order. */
export function extractJsonLdItems(html: string): RenderItem[] {
  const items: RenderItem[] = [];
  for (const node of jsonLdNodes(html)) {
    if (!isEventType(node["@type"])) continue;

    const start = parseStamp(node.startDate);
    const location = (firstOf(node.location) ?? null) as Record<string, unknown> | null;
    const address = location && typeof location === "object" ? location.address : null;
    const addressObj = address && typeof address === "object" ? (address as Record<string, unknown>) : null;
    const geo = (location && typeof location === "object" ? location.geo : null) as Record<string, unknown> | null;
    const offer = (firstOf(node.offers) ?? null) as Record<string, unknown> | null;

    // An endDate that isn't after the start is noise, not data: Bandsintown
    // pairs a timestamped startDate with a bare DATE endDate, which parses
    // EARLIER than the start and would trip validate.ts's "end is before start"
    // error on every single event.
    const end = parseStamp(node.endDate);
    const usableEnd =
      start && end && new Date(end.iso).getTime() > new Date(start.iso).getTime() ? end.iso : null;

    items.push({
      uid: "",
      title: str(node.name),
      start: start?.iso ?? null,
      end: usableEnd,
      start_time_known: start?.timeKnown ?? false,
      location: location ? str(location.name) : "",
      city: addressObj ? str(addressObj.addressLocality) : "",
      address: postalAddress(address),
      lat: geo ? num(geo.latitude) : null,
      lon: geo ? num(geo.longitude) : null,
      price: offerPrice(offer),
      url: str(node.url),
      image_url: imageUrl(node.image),
      booking_url: offer ? str(offer.url) : "",
      description: str(node.description),
    });
  }
  return items;
}

// --- Rendered text ------------------------------------------------------------

export interface TextToken {
  /** Collapsed, entity-decoded text. Empty for an image token. */
  text: string;
  /** Enclosing <a href>, if any. */
  href: string | null;
  /** <img src> for an image token, else null. */
  img: string | null;
}

const COMMENTS = /<!--[\s\S]*?-->/g;
// Elements whose contents are not readable page text. <svg> matters most: icon
// paths sit between a listing's title and its time on real pages.
const NON_TEXT_ELEMENTS = /<(script|style|noscript|svg|template|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)\/?>/g;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
}

/**
 * Rendered HTML as a stream of visible-text runs, each tagged with the link it
 * sits inside and interleaved with the images that precede it. Attribute values
 * are never emitted as text — on a real listing an `<img alt>` and a link
 * `title` both repeat the event name, and reading those would double every row.
 */
export function tokenize(html: string): TextToken[] {
  const cleaned = html.replace(COMMENTS, " ").replace(NON_TEXT_ELEMENTS, " ");
  const tokens: TextToken[] = [];
  const hrefs: string[] = [];
  const current = (): string | null => {
    for (let i = hrefs.length - 1; i >= 0; i--) if (hrefs[i]) return hrefs[i]!;
    return null;
  };
  const pushText = (raw: string): void => {
    const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
    if (text !== "") tokens.push({ text, href: current(), img: null });
  };

  let last = 0;
  for (const m of cleaned.matchAll(TAG)) {
    pushText(cleaned.slice(last, m.index));
    last = m.index + m[0].length;
    const name = m[1]!.toLowerCase();
    const closing = m[0].startsWith("</");
    if (name === "a") {
      // Push even when href is missing, so the stack stays balanced with </a>.
      if (closing) hrefs.pop();
      else hrefs.push(attr(m[2] ?? "", "href") ?? "");
    } else if (name === "img" && !closing) {
      const src = attr(m[2] ?? "", "src");
      if (src) tokens.push({ text: "", href: current(), img: src });
    }
  }
  pushText(cleaned.slice(last));
  return tokens;
}

/** Rendered HTML as plain text, one visible run per line. */
export function htmlToText(html: string): string {
  return tokenize(html)
    .filter((t) => t.text !== "")
    .map((t) => t.text)
    .join("\n");
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthNumber(word: string): number | null {
  const w = word.toLowerCase().replace(/\./g, "");
  if (w.length < 3) return null;
  const i = MONTHS.findIndex((m) => m.startsWith(w));
  return i === -1 ? null : i + 1;
}

// "Thursday, September 3, 2026" / "Sep 15, 2026" / "Aug 25" / "Oct 8 – 25, 2026"
// (a run's first day; CLAUDE.md § Dedup keeps a multi-day run as one record).
const FULL_DATE =
  /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–—-]\s*\d{1,2})?(?:,?\s+(\d{4}))?$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_TOKEN = /^[/,]?\s*(20\d{2})$/;
const DAY_TOKEN = /^(\d{1,2})(?:st|nd|rd|th)?$/;
const TIME_TOKEN = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?(?:\s+[a-z]{2,4})?$/i;

/** Listing chrome that sits where a title would be. */
const NOT_A_TITLE =
  /^(event time|buy tickets|get tickets|tickets|more info|info|details|learn more|read more|view event|add to calendar|rsvp|register|sold out|on sale|free|all ages|parking|doors|starts|time|date|when|where)$/i;

interface DateAnchor {
  month: number;
  day: number;
  year: number | null;
  /** First token index after the date. */
  next: number;
  /** Index the date itself starts at. */
  at: number;
}

function timeAt(token: TextToken | undefined): { hh: number; mm: number } | null {
  if (!token || token.text === "") return null;
  const m = TIME_TOKEN.exec(token.text);
  if (!m) return null;
  let hh = Number(m[1]);
  if (hh < 1 || hh > 12) return null;
  const meridiem = m[3]!.toLowerCase();
  if (meridiem === "p" && hh !== 12) hh += 12;
  if (meridiem === "a" && hh === 12) hh = 0;
  return { hh, mm: Number(m[2] ?? 0) };
}

/** A date starting at token `i`, whether written whole or split across spans. */
function dateAt(tokens: TextToken[], i: number): DateAnchor | null {
  const text = tokens[i]?.text ?? "";
  if (text === "") return null;

  const iso = ISO_DATE.exec(text);
  if (iso) return { month: Number(iso[2]), day: Number(iso[3]), year: Number(iso[1]), next: i + 1, at: i };

  // A listing may label its date cell ("New Date - Nov. 22", how lenovo-center
  // marks a rescheduled show). Retry on the tail after the last separator, but
  // only once the whole cell has failed — so a date RANGE ("Oct 8 – 25, 2026")
  // still resolves to the run's first day rather than its last.
  const full = FULL_DATE.exec(text) ?? FULL_DATE.exec(text.replace(/^.*[-–—:]\s*/, ""));
  if (full) {
    const month = monthNumber(full[1]!);
    const day = Number(full[2]);
    if (month !== null && day >= 1 && day <= 31) {
      let next = i + 1;
      let year = full[3] ? Number(full[3]) : null;
      // A year can trail in its own span: "Sep" "15" "/ 2026".
      if (year === null) {
        const trailing = YEAR_TOKEN.exec(tokens[next]?.text ?? "");
        if (trailing) {
          year = Number(trailing[1]);
          next += 1;
        }
      }
      return { month, day, year, next, at: i };
    }
  }

  // Split form: a bare month name, then the day in the next span.
  const month = /^[a-z]{3,9}\.?$/i.test(text) ? monthNumber(text) : null;
  if (month !== null) {
    const dayMatch = DAY_TOKEN.exec(tokens[i + 1]?.text ?? "");
    if (dayMatch) {
      const day = Number(dayMatch[1]);
      if (day >= 1 && day <= 31) {
        let next = i + 2;
        let year: number | null = null;
        const trailing = YEAR_TOKEN.exec(tokens[next]?.text ?? "");
        if (trailing) {
          year = Number(trailing[1]);
          next += 1;
        }
        return { month, day, year, next, at: i };
      }
    }
  }
  return null;
}

/** The next year in which month/day falls on or after `now`. */
function resolveYear(month: number, day: number, now: Date): number {
  const { y } = nyFields(now);
  return new Date(nyIso(y, month, day, 23, 59)).getTime() >= now.getTime() ? y : y + 1;
}

function resolveUrl(href: string | null, pageUrl: string): string {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return "";
  }
}

/** How far past a date a listing's title and time may sit. */
const LOOKAHEAD = 12;

/**
 * Event candidates read off a rendered listing's text. Heuristic by necessity —
 * every listing lays its rows out differently — so what it looks for is the
 * shape they share: a date, a title beside it, and a time.
 */
export function extractTextItems(html: string, pageUrl: string, now: Date): RenderItem[] {
  const tokens = tokenize(html);

  const anchors: DateAnchor[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const anchor = dateAt(tokens, i);
    if (anchor) {
      anchors.push(anchor);
      i = anchor.next - 1;
    }
  }

  const items: RenderItem[] = [];
  anchors.forEach((anchor, ai) => {
    // Bound the scan by the next row, so a row with no title of its own cannot
    // borrow the title of the row below it.
    const limit = Math.min(anchor.next + LOOKAHEAD, anchors[ai + 1]?.at ?? tokens.length);
    const rowStart = ai === 0 ? 0 : (anchors[ai - 1]?.next ?? 0);
    const couldBeTitle = (i: number): boolean => {
      const token = tokens[i]!;
      return token.text.length >= 2 && !NOT_A_TITLE.test(token.text) && !timeAt(token) && !dateAt(tokens, i);
    };

    let titleIdx = -1;
    let time: { hh: number; mm: number } | null = null;
    for (let i = anchor.next; i < limit; i++) {
      const token = tokens[i]!;
      if (token.text === "") continue;
      const asTime = timeAt(token);
      if (asTime) {
        time ??= asTime;
        continue;
      }
      if (titleIdx === -1 && couldBeTitle(i)) titleIdx = i;
    }
    // Listings that lead with the title and put the date underneath are as
    // common as the other way round; fall back to the nearest heading above.
    for (let i = anchor.at - 1; titleIdx === -1 && i >= Math.max(rowStart, anchor.at - 4); i--) {
      if (tokens[i]!.text !== "" && couldBeTitle(i)) titleIdx = i;
    }
    if (titleIdx === -1) return;

    const title = tokens[titleIdx]!;
    const year = anchor.year ?? resolveYear(anchor.month, anchor.day, now);
    // The row's thumbnail precedes its date; keep the search inside this row.
    const images = tokens.slice(rowStart, titleIdx + 1).filter((t) => t.img);
    const image = images.find((t) => t.href && t.href === title.href) ?? images[images.length - 1];

    items.push({
      uid: "",
      title: title.text,
      start: nyIso(year, anchor.month, anchor.day, time?.hh ?? 0, time?.mm ?? 0),
      end: null,
      start_time_known: time !== null,
      location: "",
      city: "",
      address: "",
      lat: null,
      lon: null,
      price: "",
      url: resolveUrl(title.href, pageUrl),
      image_url: resolveUrl(image?.img ?? null, pageUrl),
      booking_url: "",
      description: "",
    });
  });
  return items;
}

// --- Strategy + blocked-page detection ----------------------------------------

/**
 * Read the page with the declared strategy. "auto" prefers JSON-LD and falls
 * back to text only when the DOM has no Event nodes at all — Lenovo Center
 * carries one ld+json block and it is an Organization, so JSON-LD alone would
 * leave it at zero.
 */
export function extractItems(
  html: string,
  pageUrl: string,
  now: Date,
  extract: RenderExtract = "auto",
): { items: RenderItem[]; extract: ResolvedExtract } {
  if (extract === "text") return { items: extractTextItems(html, pageUrl, now), extract: "text" };
  const structured = extractJsonLdItems(html);
  if (extract === "json-ld" || structured.length > 0) return { items: structured, extract: "json-ld" };
  return { items: extractTextItems(html, pageUrl, now), extract: "text" };
}

const BLOCK_MARKERS: Array<[RegExp, string]> = [
  [/attention required!?\s*\|\s*cloudflare/i, 'a Cloudflare bot check ("Attention Required")'],
  [/just a moment\s*(\.\.\.|…)/i, 'a Cloudflare interstitial ("Just a moment…")'],
  [/sorry,? you have been blocked/i, "a Cloudflare block page"],
  [/enable javascript and cookies to continue/i, "a JavaScript/cookie challenge"],
  [/pardon our interruption/i, "a bot-detection interstitial"],
  [/request unsuccessful\.?\s*incapsula/i, "an Imperva/Incapsula block"],
  [/verify (?:you are|yourself as) (?:a )?human/i, "a human-verification challenge"],
  [/you don'?t have permission to access|access denied/i, "an access-denied page"],
];

/**
 * Names the interstitial a render came back with, or null for a real page.
 *
 * This exists because a blocked render and a genuinely quiet week are
 * indistinguishable downstream — both are zero events. chapel-of-bones logged
 * nine straight weeks of silent zeros while running shows; a blocked page has to
 * say so out loud. Comments are stripped first, so a page that merely *mentions*
 * a bot check in markup isn't mistaken for one.
 */
export function looksBlocked(html: string): string | null {
  const head = html.replace(COMMENTS, " ").slice(0, 6000);
  for (const [re, label] of BLOCK_MARKERS) if (re.test(head)) return label;
  return null;
}

const orUnknown = (v: string): string => (v.trim() === "" ? "unknown" : v.trim());

function toEvent(item: RenderItem, source: EventSource, now: string): TriangleEvent {
  const start = item.start!;
  const startMs = new Date(start).getTime();
  const endMs = item.end ? new Date(item.end).getTime() : NaN;

  const ev: TriangleEvent = {
    id: "",
    // No listing carries our taxonomy; the source's own first category is the
    // honest default, and enrichment refines it.
    category: source.categories?.[0] ?? "unknown",
    name: item.title,
    tags: [],
    venue: orUnknown(item.location !== "" ? item.location : source.name),
    address: orUnknown(item.address),
    city: item.city.trim() !== "" ? item.city.trim() : source.city,
    lat: item.lat,
    lon: item.lon,
    start,
    end: Number.isNaN(endMs) ? "" : item.end!,
    duration_min: Number.isNaN(endMs) ? null : Math.round((endMs - startMs) / 60000),
    price: orUnknown(item.price),
    budget: item.price.trim().toLowerCase() === "free" ? "$" : "unknown",
    // Placeholders: no listing says. Enrichment (weekly.md step 5) confirms
    // both, and an outdoor event still needs a forecast before it ships.
    indoor_outdoor: "indoor",
    vegan: "unknown",
    vegetarian: "unknown",
    weather: null,
    image_url: orUnknown(item.image_url),
    booking_url: orUnknown(item.booking_url || item.url),
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
 * Read one already-rendered page into draft events for `source`.
 *
 * Never throws: a page that can't be read comes back as zero events plus an
 * `errors` entry, so one dead origin cannot take down a weekly run. Drops, in
 * order: rows with no date, untitled rows, rows outside the Triangle, rows
 * outside the window, and same-`id` repeats — both an unnamed event and a
 * duplicate id are hard `npm run validate` errors, so neither leaves here.
 */
export function ingestRender(source: EventSource, html: string, opts: IngestOptions): RenderIngestResult {
  const dropped: IngestDropped = { no_start: 0, no_title: 0, out_of_metro: 0, out_of_window: 0, duplicate: 0 };
  const label = `source "${source.id}"`;
  const hint = source.ingest;

  if (!hint || hint.mode !== "render") {
    return {
      events: [],
      extract: null,
      dropped,
      errors: [
        `${label}: no render declared (set ingest.mode = "render") — Phase A reads this source with ` +
          `a plain fetch. Declare rendering only when no URL on the site serves the listing.`,
      ],
      warnings: [],
    };
  }

  const blocked = looksBlocked(html);
  if (blocked) {
    return {
      events: [],
      extract: null,
      dropped,
      errors: [
        `${label}: the render returned ${blocked}, not the listing — this is NOT a quiet week. ` +
          `Capture the page with a browser tool and re-run with --html.`,
      ],
      warnings: [],
    };
  }

  const now = new Date(opts.now);
  const pageUrl = hint.url ?? source.url;
  const declared = RENDER_EXTRACTS.includes(hint.extract ?? "auto") ? (hint.extract ?? "auto") : "auto";
  const { items, extract } = extractItems(html, pageUrl, now, declared);

  const windowStart = opts.window ? new Date(opts.window.start).getTime() : null;
  const windowEnd = opts.window ? new Date(opts.window.end).getTime() : null;
  const events: TriangleEvent[] = [];
  const seen = new Set<string>();
  const timeUnknown: string[] = [];

  for (const item of items) {
    if (!item.start) {
      dropped.no_start++;
      continue;
    }
    if (item.title === "") {
      dropped.no_title++;
      continue;
    }
    // A venue page is "local" scope by definition: a row with no place of its
    // own is at the venue. Coordinates, when the page has them, still decide.
    if (!isInMetro(item, source.city, { scope: "local", origin: opts.origin })) {
      dropped.out_of_metro++;
      continue;
    }
    if (windowStart !== null && windowEnd !== null) {
      const at = new Date(item.start).getTime();
      if (at < windowStart || at > windowEnd) {
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
    if (!item.start_time_known) timeUnknown.push(ev.name);
  }

  const warnings: string[] = [];
  if (events.length === 0) {
    warnings.push(
      `${label}: rendered ${html.length} bytes but extracted 0 events (${extract}) — the page's ` +
        `markup may have changed, or the week really is empty.`,
    );
  }
  if (timeUnknown.length > 0) {
    warnings.push(
      `${label}: ${timeUnknown.length} event(s) gave a date but no start time, so start is midnight ` +
        `until you confirm it: ${timeUnknown.join(", ")}`,
    );
  }
  return { events, extract, dropped, errors: [], warnings };
}
