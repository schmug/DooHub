// Hand-picked event selection behind the "itinerary .ics" export.
//
// Same split as theme.ts: the parsing/derivation logic is pure and unit-tested,
// while the localStorage touch is a thin try/catch wrapper. The Vitest run has
// no DOM, so storage itself is exercised in the browser, not in tests.

import type { TriangleEvent } from "../types";

export const SELECTION_STORAGE_KEY = "tw:selection";

/**
 * Parse a raw localStorage payload into an id list. Tolerates every shape a
 * corrupted or hand-edited key can take — anything unexpected means "nothing
 * picked" rather than a crash on mount.
 */
export function parseSelection(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === "string");
}

/**
 * Drop ids that no longer exist in the event set. events.json refreshes weekly
 * and drops past events; without this the stored list would grow without bound
 * and the selection count would overstate what actually exports.
 */
export function pruneSelection(ids: string[], events: TriangleEvent[]): string[] {
  const live = new Set(events.map((ev) => ev.id));
  return ids.filter((id) => live.has(id));
}

/**
 * The picked events in chronological order — an itinerary reads in time order
 * regardless of the sort the user happens to be browsing with.
 */
export function selectedEvents(events: TriangleEvent[], ids: string[]): TriangleEvent[] {
  const picked = new Set(ids);
  return events
    .filter((ev) => picked.has(ev.id))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/** Read the persisted selection, tolerating disabled/throwing storage. */
export function getStoredSelection(): string[] {
  try {
    return parseSelection(localStorage.getItem(SELECTION_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Persist the selection (no-op if storage is unavailable). */
export function storeSelection(ids: string[]): void {
  try {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore — private mode / blocked storage */
  }
}
