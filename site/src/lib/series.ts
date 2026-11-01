import type { TriangleEvent } from "../types";

/**
 * Loose title key for spotting a recurring series in the visible list:
 * lowercase, punctuation stripped, whitespace collapsed. Deliberately simpler
 * than the pipeline's dedup `normName` — this only decides which cards stack,
 * never identity, so every occurrence keeps its own id, pick box and .ics.
 */
export function seriesKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface SeriesItem {
  key: string;
  /** The occurrence that represents the series — the first in list order. */
  lead: TriangleEvent;
  /** Every occurrence, lead included, in list order. */
  events: TriangleEvent[];
}

/**
 * Stack events that share a title into one item, placed where the first of
 * them appears, so the caller's sort order still decides what leads.
 * `scope` adds to the key, e.g. the city in a By-City view, so a series never
 * pulls an occurrence out of the group it belongs in.
 */
export function collapseSeries(
  events: TriangleEvent[],
  scope: (ev: TriangleEvent) => string = () => "",
): SeriesItem[] {
  const byKey = new Map<string, SeriesItem>();
  const out: SeriesItem[] = [];
  for (const ev of events) {
    const name = seriesKey(ev.name);
    const key = `${scope(ev)}\u0000${name || ev.id}`;
    const item = byKey.get(key);
    if (item) item.events.push(ev);
    else {
      const fresh = { key, lead: ev, events: [ev] };
      byKey.set(key, fresh);
      out.push(fresh);
    }
  }
  return out;
}

/** Number of distinct venues across a series, for the "at 17 venues" line. */
export function venueCount(events: TriangleEvent[]): number {
  return new Set(events.map((e) => `${e.venue.trim().toLowerCase()}|${e.city.trim().toLowerCase()}`)).size;
}
