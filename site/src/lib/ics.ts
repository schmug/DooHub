// Client-side iCalendar export for "filtered events" + per-itinerary downloads.
// MIRROR of scripts/lib/ics.ts (the server build). Keep UID format, escaping, and
// VEVENT fields identical so a downloaded .ics matches the published events.ics.

import type { TriangleEvent } from "../types";

const PRODID = "-//cortech.online//Triangle Weekend Events//EN";
const UID_DOMAIN = "triangle-weekend.cortech.online";
const TZID = "America/New_York";

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

const encoder = new TextEncoder();

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const bytes = encoder.encode(line);
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  const decoder = new TextDecoder();
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    out.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    limit = 74;
  }
  return out.join("\r\n ");
}

function toLocalStamp(iso: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-US", {
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
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}${p.month}${p.day}T${hour}${p.minute}${p.second}`;
}

function toUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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

function buildVevent(ev: TriangleEvent, now: Date): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${ev.id}@${UID_DOMAIN}`, `DTSTAMP:${toUtcStamp(now)}`];
  lines.push(`DTSTART;TZID=${TZID}:${toLocalStamp(ev.start)}`);
  if (ev.end) lines.push(`DTEND;TZID=${TZID}:${toLocalStamp(ev.end)}`);
  lines.push(`SUMMARY:${escapeText(ev.name)}`);
  if (ev.address) lines.push(`LOCATION:${escapeText(ev.address)}`);
  const desc = describe(ev);
  if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
  const url = ev.booking_url || ev.info_url;
  if (url) lines.push(`URL:${escapeText(url)}`);
  if (typeof ev.lat === "number" && typeof ev.lon === "number") lines.push(`GEO:${ev.lat};${ev.lon}`);
  if (ev.category) lines.push(`CATEGORIES:${escapeText(ev.category)}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(events: TriangleEvent[], calendarName = "Triangle Weekend Events"): string {
  const now = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    `X-WR-TIMEZONE:${TZID}`,
    ...VTIMEZONE,
  ];
  for (const ev of events) lines.push(...buildVevent(ev, now));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Build and trigger a browser download of an .ics for the given events. */
export function downloadIcs(events: TriangleEvent[], filename: string, calendarName?: string): void {
  const ics = buildIcs(events, calendarName);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
