import type { Budget, IndoorOutdoor, Origin, TriangleEvent } from "../types";
import { distanceFrom } from "./distance";
import { dayKey } from "./format";
import { FULL_TIME_RANGE, isFullTimeRange, matchesTimeRange, type TimeRange } from "./timeRange";
import { emptyInOut, inOutCount, matchesInOut, type InOut } from "./inOut";

export type SortKey = "date" | "distance" | "price" | "city" | "category";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Date / time" },
  { value: "distance", label: "Distance" },
  { value: "price", label: "Price" },
  { value: "city", label: "City" },
  { value: "category", label: "Category" },
];

export interface FilterState {
  search: string;
  days: string[]; // dayKeys; empty = all
  timeRange: TimeRange; // NY-local start minutes; full range = any time
  includeAllDay: boolean; // keep all-day / time-TBD events when filtering by time
  /** "Within N miles" of the origin; null = any distance. */
  maxMiles: number | null;
  /** With a distance limit set, keep events that have no coordinates. */
  includeUnknownLocation: boolean;
  freeOnly: boolean;
  budgets: Budget[];
  indoorOutdoor: IndoorOutdoor[];
  vegan: boolean;
  vegetarian: boolean;
  categories: InOut; // include / exclude by category
}

export const emptyFilters: FilterState = {
  search: "",
  days: [],
  timeRange: FULL_TIME_RANGE,
  includeAllDay: true,
  maxMiles: null,
  includeUnknownLocation: true,
  freeOnly: false,
  budgets: [],
  indoorOutdoor: [],
  vegan: false,
  vegetarian: false,
  categories: emptyInOut,
};

export function isFilterActive(f: FilterState): boolean {
  return (
    f.search.trim() !== "" ||
    f.days.length > 0 ||
    timeFilterCount(f) > 0 ||
    f.maxMiles !== null ||
    f.freeOnly ||
    f.budgets.length > 0 ||
    f.indoorOutdoor.length > 0 ||
    f.vegan ||
    f.vegetarian ||
    inOutCount(f.categories) > 0
  );
}

/**
 * Number of active chip-style filters — everything in the collapsible filter
 * panel, i.e. excluding the always-visible search box. Drives the count badge
 * on the mobile "Filters" toggle so applied filters are visible while collapsed.
 */
export function activeFilterCount(f: FilterState): number {
  return (
    f.days.length +
    timeFilterCount(f) +
    (f.maxMiles !== null ? 1 : 0) +
    (f.freeOnly ? 1 : 0) +
    f.budgets.length +
    f.indoorOutdoor.length +
    (f.vegan ? 1 : 0) +
    (f.vegetarian ? 1 : 0) +
    inOutCount(f.categories)
  );
}

/** A narrowed time range and hiding all-day/TBD each count as one filter. */
function timeFilterCount(f: FilterState): number {
  return (isFullTimeRange(f.timeRange) ? 0 : 1) + (f.includeAllDay ? 0 : 1);
}

const budgetRank: Record<Budget, number> = {
  $: 1,
  $$: 2,
  $$$: 3,
  $$$$: 4,
  unknown: 99,
};

function matchesSearch(ev: TriangleEvent, q: string): boolean {
  const hay = [ev.name, ev.venue, ev.city, ev.category, ev.description ?? "", ...ev.tags]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function applyFilters(events: TriangleEvent[], f: FilterState, origin: Origin): TriangleEvent[] {
  const q = f.search.trim().toLowerCase();
  return events.filter((ev) => {
    if (q && !matchesSearch(ev, q)) return false;
    if (f.days.length && !f.days.includes(dayKey(ev.start))) return false;
    if (timeFilterCount(f) && !matchesTimeRange(ev, f.timeRange, f.includeAllDay)) return false;
    if (f.freeOnly && !/free/i.test(ev.price)) return false;
    if (f.budgets.length && !f.budgets.includes(ev.budget)) return false;
    if (!matchesInOut(f.categories, ev.category)) return false;

    if (f.indoorOutdoor.length) {
      // "both" events match either indoor or outdoor selection.
      const ok = f.indoorOutdoor.some((sel) => ev.indoor_outdoor === sel || ev.indoor_outdoor === "both");
      if (!ok) return false;
    }
    if (f.vegan && ev.vegan !== "yes") return false;
    if (f.vegetarian && ev.vegetarian !== "yes") return false;

    if (f.maxMiles !== null) {
      const d = distanceFrom(origin, ev.lat, ev.lon);
      if (!d) {
        if (!f.includeUnknownLocation) return false;
      } else if (d.miles > f.maxMiles) return false;
    }
    return true;
  });
}

export function sortEvents(events: TriangleEvent[], key: SortKey, origin: Origin): TriangleEvent[] {
  const out = [...events];
  out.sort((a, b) => {
    switch (key) {
      case "date":
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      case "price":
        return budgetRank[a.budget] - budgetRank[b.budget] || a.name.localeCompare(b.name);
      case "city":
        return a.city.localeCompare(b.city) || new Date(a.start).getTime() - new Date(b.start).getTime();
      case "category":
        return a.category.localeCompare(b.category) || new Date(a.start).getTime() - new Date(b.start).getTime();
      case "distance": {
        const da = distanceFrom(origin, a.lat, a.lon)?.miles ?? Infinity;
        const db = distanceFrom(origin, b.lat, b.lon)?.miles ?? Infinity;
        return da - db || new Date(a.start).getTime() - new Date(b.start).getTime();
      }
      default:
        return 0;
    }
  });
  return out;
}

export function uniqueDays(events: TriangleEvent[]): string[] {
  return [...new Set(events.map((e) => dayKey(e.start)))].sort();
}

export function uniqueCategories(events: TriangleEvent[]): string[] {
  return [...new Set(events.map((e) => e.category))].sort();
}
