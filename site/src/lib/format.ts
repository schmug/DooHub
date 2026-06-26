import type { Budget, IndoorOutdoor, TimeOfDay, TriangleEvent } from "../types";

const TZ = "America/New_York";

interface TimeParts {
  hour24: number;
  hour12: number;
  minute: number;
  ampm: string;
}

function nyTimeParts(iso: string): TimeParts {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(d)) parts[p.type] = p.value;
  const hour12 = Number(parts.hour);
  const minute = Number(parts.minute);
  const ampm = (parts.dayPeriod || "AM").toUpperCase();
  let hour24 = hour12 % 12;
  if (ampm === "PM") hour24 += 12;
  return { hour24, hour12, minute, ampm };
}

/** NY-local YYYY-MM-DD, used as a grouping/filter key. */
export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "Saturday, June 20" */
export function formatDayHeader(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

/** "Sat, Jun 20" — compact */
export function formatDayShort(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** "SAT" — upper-case 3-letter NY-local weekday, for the departure-board look. */
export function formatWeekdayShort(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" })
    .format(new Date(iso))
    .toUpperCase();
}

/** "18:00" — 24-hour NY-local clock, departure-board style. */
export function formatClock24(iso: string): string {
  const p = nyTimeParts(iso);
  return `${String(p.hour24).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function fmtClock(p: TimeParts): string {
  return p.minute === 0 ? `${p.hour12}` : `${p.hour12}:${String(p.minute).padStart(2, "0")}`;
}

/** "2–5 PM" (collapses meridiem when equal), or "11 AM – 1 PM". */
export function formatTimeRange(startISO: string, endISO?: string): string {
  const s = nyTimeParts(startISO);
  const start = `${fmtClock(s)} ${s.ampm}`;
  if (!endISO) return start;
  const e = nyTimeParts(endISO);
  if (s.ampm === e.ampm) return `${fmtClock(s)}–${fmtClock(e)} ${e.ampm}`;
  return `${fmtClock(s)} ${s.ampm} – ${fmtClock(e)} ${e.ampm}`;
}

export function timeOfDay(iso: string): TimeOfDay {
  const h = nyTimeParts(iso).hour24;
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export const CATEGORY_ICONS: Record<string, string> = {
  festivals: "🎪",
  concerts: "🎵",
  theater: "🎭",
  markets: "🛍️",
  sports: "🏟️",
  galleries: "🖼️",
  museums: "🏛️",
  tours: "🚶",
  classes: "🎨",
  "breweries/tastings": "🍺",
  trivia: "🧠",
  parks: "🌳",
  trails: "🥾",
  "historic sites": "🏰",
  shopping: "🛒",
  "family/kids": "🧸",
  "food events": "🍽️",
  comedy: "🎤",
  nightlife: "🌃",
};

export function categoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? "📍";
}

/**
 * "Soft Transit" colour families. Every category maps to one of five pastel
 * palettes; the chosen family drives the card tint, the 5px left "category
 * line", badges, and map markers so the colour reads consistently across views.
 */
export type CategoryFamily = "green" | "purple" | "clay" | "blue" | "rose";

const CATEGORY_FAMILY: Record<string, CategoryFamily> = {
  museums: "green",
  galleries: "green",
  parks: "green",
  trails: "green",
  "historic sites": "green",
  tours: "green",
  "family/kids": "green",
  concerts: "purple",
  nightlife: "purple",
  comedy: "purple",
  markets: "clay",
  "breweries/tastings": "clay",
  shopping: "clay",
  "food events": "clay",
  festivals: "clay",
  sports: "blue",
  classes: "blue",
  theater: "rose",
  trivia: "rose",
};

/** The colour family for a category (defaults to the calm green palette). */
export function categoryFamily(category: string): CategoryFamily {
  return CATEGORY_FAMILY[category] ?? "green";
}

const FAMILY_ACCENT: Record<CategoryFamily, string> = {
  green: "#3f8568",
  purple: "#6f5aa6",
  clay: "#b07b45",
  blue: "#4a7aa6",
  rose: "#b05f7a",
};

/** Solid accent hex for a category — for inline use (e.g. Leaflet markers). */
export function categoryColor(category: string): string {
  return FAMILY_ACCENT[categoryFamily(category)];
}

export function budgetColorVar(budget: Budget): string {
  switch (budget) {
    case "$":
      return "var(--b-1)";
    case "$$":
      return "var(--b-2)";
    case "$$$":
      return "var(--b-3)";
    case "$$$$":
      return "var(--b-4)";
    default:
      return "var(--muted-2)";
  }
}

export function ioIcon(io: IndoorOutdoor): string {
  if (io === "indoor") return "🏠";
  if (io === "outdoor") return "🌳";
  return "🏠🌳";
}

export function ioLabel(io: IndoorOutdoor): string {
  if (io === "indoor") return "Indoor";
  if (io === "outdoor") return "Outdoor";
  return "Indoor/Outdoor";
}

export function weatherIcon(summary: string): string {
  const s = summary.toLowerCase();
  if (/(thunder|storm)/.test(s)) return "⛈️";
  if (/(rain|shower|drizzle)/.test(s)) return "🌧️";
  if (/snow|flurr/.test(s)) return "❄️";
  // Check partial cloud ("partly cloudy", "mostly sunny") before the generic
  // cloud match, otherwise "partly cloudy" would resolve to fully overcast.
  if (/(part|mostly sun|few cloud)/.test(s)) return "⛅";
  if (/(cloud|overcast)/.test(s)) return "☁️";
  if (/(sun|clear|fair)/.test(s)) return "☀️";
  if (/fog|mist|haze/.test(s)) return "🌫️";
  return "🌤️";
}

/** Pretty "Add to Calendar" filename slug. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "events";
}

export function eventDescription(ev: TriangleEvent): string {
  return ev.description ?? "";
}
