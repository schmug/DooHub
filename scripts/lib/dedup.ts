// Dedup helpers — the executable form of CLAUDE.md § Dedup. Pure + tested so the
// documented rules and the actual behavior can't drift. The weekly run (and any
// future merge tooling) should use these rather than re-deriving the logic.

import { createHash } from "node:crypto";
import type { TriangleEvent } from "./types.js";

// Filler tokens dropped from names before hashing/matching.
const NAME_STOPWORDS = new Set([
  "the", "a", "an", "of", "at", "in", "on", "for", "to", "and", "presents",
  "present", "featuring", "feat", "ft", "with", "live", "nc", "north",
  "carolina", "raleigh", "durham", "cary", "chapel", "hill", "series", "event",
]);

// Known venue variants -> canonical form (keys are already normName-normalized:
// lowercase, punctuation stripped). Extend as venues recur.
const VENUE_ALIASES: Record<string, string> = {
  "ncma": "nc museum of art",
  "north carolina museum of art": "nc museum of art",
  "nc art museum": "nc museum of art",
  "dpac": "dpac",
  "durham performing arts center": "dpac",
  "red hat amp": "red hat amphitheater",
  "koka booth": "koka booth amphitheatre",
  "carolina theatre of durham": "carolina theatre",
  "contemporary art museum raleigh": "cam raleigh",
  // Renamed venues — sources still use both names for the same building.
  // PNC's naming rights expired 2024-08-31; the arena became Lenovo Center.
  "pnc arena": "lenovo center",
  // Duke Energy Center for the Performing Arts was renamed in 2023.
  "duke energy center for the performing arts": "martin marietta center for the performing arts",
  "duke energy center": "martin marietta center for the performing arts",
  // Naming variants (no rename, just inconsistent listings).
  "quail ridge bookstore": "quail ridge books",
};

// Sub-venue -> the complex that contains it. Consulted ONLY by isSameOccurrence's
// venue test, never by normVenue/computeId: collapsing a hall into its parent
// would merge distinct shows playing different halls the same night. Keys and
// values are already normVenue-normalized.
const VENUE_PARENTS: Record<string, string> = {
  "meymandi concert hall": "martin marietta center for the performing arts",
  "raleigh memorial auditorium": "martin marietta center for the performing arts",
  "a j fletcher opera theater": "martin marietta center for the performing arts",
  "aj fletcher opera theater": "martin marietta center for the performing arts",
  "kennedy theatre": "martin marietta center for the performing arts",
};

/** lowercase, strip punctuation, split, drop stopwords. Returns raw token list. */
function rawTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NAME_STOPWORDS.has(t));
}

/** Order-insensitive normalized name: unique tokens, sorted, space-joined. */
export function normName(name: string): string {
  return [...new Set(rawTokens(name))].sort().join(" ");
}

/** Token SET for a title/venue (for Jaccard / subset checks). */
export function tokenSet(s: string): Set<string> {
  return new Set(rawTokens(s));
}

/** Canonical venue: lowercase, drop leading "the", collapse ws, apply aliases. */
export function normVenue(venue: string): string {
  const base = venue
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the\s+/, "");
  return VENUE_ALIASES[base] ?? base;
}

/** The complex containing this sub-venue, or null if it isn't a known sub-venue. */
export function venueParent(venue: string): string | null {
  return VENUE_PARENTS[normVenue(venue)] ?? null;
}

/** start date (not time) in America/New_York as YYYY-MM-DD. */
export function localDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // en-CA yields YYYY-MM-DD
}

/** Stable 12-char id = sha1(normName | localDate | normVenue). */
export function computeId(ev: Pick<TriangleEvent, "name" | "start" | "venue" | "city">): string {
  const venue = ev.venue && ev.venue.toLowerCase() !== "unknown" ? ev.venue : ev.city;
  const key = `${normName(ev.name)}|${localDate(ev.start)}|${normVenue(venue)}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 12);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

const NINETY_MIN_MS = 90 * 60 * 1000;

/**
 * True when two records describe the SAME occurrence even if their ids differ:
 * venue match (direct, fuzzy, or parent-child) AND start within ±90min AND title match (Jaccard >= 0.6 or subset).
 */
export function isSameOccurrence(a: TriangleEvent, b: TriangleEvent): boolean {
  const vA = normVenue(a.venue);
  const vB = normVenue(b.venue);
  const venueMatch =
    vA === vB ||
    jaccard(tokenSet(a.venue), tokenSet(b.venue)) >= 0.6 ||
    // One names a hall, the other the complex containing it. Safe because the
    // +/-90min and title-Jaccard>=0.6 checks below still have to pass.
    venueParent(a.venue) === vB ||
    venueParent(b.venue) === vA;
  if (!venueMatch) return false;

  const tA = new Date(a.start).getTime();
  const tB = new Date(b.start).getTime();
  if (Number.isNaN(tA) || Number.isNaN(tB) || Math.abs(tA - tB) > NINETY_MIN_MS) return false;

  const nA = tokenSet(a.name);
  const nB = tokenSet(b.name);
  return jaccard(nA, nB) >= 0.6 || isSubset(nA, nB) || isSubset(nB, nA);
}
