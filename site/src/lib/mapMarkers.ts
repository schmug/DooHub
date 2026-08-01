// Pure helpers behind the selection-aware map. Kept out of MapView so they can
// be unit-tested — the project has no DOM test environment, so anything that
// only Leaflet can exercise stays in the component and anything derivable lives
// here.

import type { TriangleEvent } from "../types";

/** Leaflet's `[[south, west], [north, east]]` corner pair. */
export type Bounds = [[number, number], [number, number]];

/**
 * The set of events the map should plot: everything the filters left visible,
 * plus any picked event they hid.
 *
 * The selection is deliberately filter-independent — the count and the .ics
 * export have always reported picks the filters hide — so the map has to as
 * well, or narrowing a filter would silently drop pins out of the user's
 * itinerary. Visible order comes first so the common no-selection case is
 * byte-for-byte the old behavior.
 */
export function mergeForMap(visible: TriangleEvent[], picked: TriangleEvent[]): TriangleEvent[] {
  const shown = new Set(visible.map((ev) => ev.id));
  return [...visible, ...picked.filter((ev) => !shown.has(ev.id))];
}

/**
 * Bounding box over the events that have coordinates, or null when none do.
 * Geocoding is best-effort per CLAUDE.md, so a coordinate-less selection is a
 * normal state, not an error — the caller leaves the viewport alone.
 */
export function boundsFor(events: TriangleEvent[]): Bounds | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  let found = false;

  for (const ev of events) {
    if (typeof ev.lat !== "number" || typeof ev.lon !== "number") continue;
    found = true;
    south = Math.min(south, ev.lat);
    north = Math.max(north, ev.lat);
    west = Math.min(west, ev.lon);
    east = Math.max(east, ev.lon);
  }

  return found ? [[south, west], [north, east]] : null;
}

/**
 * Stable signature of a bounds, so a React effect can depend on the box's
 * *value* instead of the array's identity — otherwise every render would look
 * like a new box and refit the map out from under the user.
 */
export function boundsKey(b: Bounds | null): string {
  if (!b) return "none";
  return b.flat().map((n) => n.toFixed(5)).join(",");
}
