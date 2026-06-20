// RFC 5545 iCalendar builder for events.json -> public/events.ics.
//
// Pure string builder (no fs / no DOM) so it's unit-testable and so the browser
// can use the same shape. NOTE: the site keeps a near-identical client-side copy
// at site/src/lib/ics.ts for "filtered events" export. If you change UID format,
// escaping, or VEVENT fields here, mirror it there.

import type { TriangleEvent } from "./types.js";

const PRODID = "-//cortech.online//Triangle Weekend Events//EN";
const UID_DOMAIN = "triangle-weekend.cortech.online";
const TZID = "America/New_York";

// Static VTIMEZONE for US Eastern (matches America/New_York DST rules since 2007).
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "X-LIC-LOCATION:America/New_York",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Escape per RFC 5545 §3.3.11 (TEXT). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/** Fold a content line at 75 octets (UTF-8 aware), continuation = CRLF + space. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Don't split a multi-byte UTF-8 sequence: back off until `end` is a char boundary.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines lead with a space, leaving 74 octets
  }
  return out.join("\r\n ");
}

/** ISO string -> wall-clock components in America/New_York: YYYYMMDDTHHMMSS. */
export function toLocalStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZID,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}${p.month}${p.day}T${hour}${p.minute}${p.second}`;
}

/** UTC stamp for DTSTAMP: YYYYMMDDTHHMMSSZ. */
export function toUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function eventUid(id: string): string {
  return `${id}@${UID_DOMAIN}`;
}

function describe(ev: TriangleEvent): string {
  const parts: string[] = [];
  if (ev.description) parts.push(ev.description);
  if (ev.price) parts.push(`Price: ${ev.price}`);
  const diet: string[] = [];
  if (ev.vegan === "yes") diet.push("vegan options");
  if (ev.vegetarian === "yes") diet.push("vegetarian options");
  if (diet.length) parts.push(diet.join(", "));
  const link = ev.booking_url || ev.info_url;
  if (link) parts.push(`Booking: ${link}`);
  return parts.join("\n");
}

export function buildVevent(ev: TriangleEvent, now: Date): string[] {
  const lines: string[] = ["BEGIN:VEVENT"];
  lines.push(`UID:${eventUid(ev.id)}`);
  lines.push(`DTSTAMP:${toUtcStamp(now)}`);
  lines.push(`DTSTART;TZID=${TZID}:${toLocalStamp(ev.start)}`);
  if (ev.end) lines.push(`DTEND;TZID=${TZID}:${toLocalStamp(ev.end)}`);
  lines.push(`SUMMARY:${escapeText(ev.name)}`);
  if (ev.address) lines.push(`LOCATION:${escapeText(ev.address)}`);
  const desc = describe(ev);
  if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
  const url = ev.booking_url || ev.info_url;
  if (url) lines.push(`URL:${escapeText(url)}`);
  if (typeof ev.lat === "number" && typeof ev.lon === "number") {
    lines.push(`GEO:${ev.lat};${ev.lon}`);
  }
  if (ev.category) lines.push(`CATEGORIES:${escapeText(ev.category)}`);
  lines.push("END:VEVENT");
  return lines;
}

export interface BuildIcsOptions {
  calendarName?: string;
  now?: Date;
}

/** Build a complete VCALENDAR string (CRLF line endings) from events. */
export function buildIcs(events: TriangleEvent[], opts: BuildIcsOptions = {}): string {
  const now = opts.now ?? new Date();
  const name = opts.calendarName ?? "Triangle Weekend Events";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${TZID}`,
    ...VTIMEZONE,
  ];
  for (const ev of events) lines.push(...buildVevent(ev, now));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
