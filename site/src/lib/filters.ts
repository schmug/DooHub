import type { Budget, IndoorOutdoor, Origin, TimeOfDay, TriangleEvent } from "../types";
import { bandFor, distanceFrom, type DistanceBand } from "./distance";
import { dayKey, timeOfDay } from "./format";

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
  timesOfDay: TimeOfDay[];
  distanceBands: DistanceBand[];
  freeOnly: boolean;
  budgets: Budget[];
  indoorOutdoor: IndoorOutdoor[];
  vegan: boolean;
  vegetarian: boolean;
  categories: string[];
}

export const emptyFilters: FilterState = {
  search: "",
  days: [],
  timesOfDay: [],
  distanceBands: [],
  freeOnly: false,
  budgets: [],
  indoorOutdoor: [],
  vegan: false,
  vegetarian: false,
  categories: [],
};

export function isFilterActive(f: FilterState): boolean {
  return (
    f.search.trim() !== "" ||
    f.days.length > 0 ||
    f.timesOfDay.length > 0 ||
    f.distanceBands.length > 0 ||
    f.freeOnly ||
    f.budgets.length > 0 ||
    f.indoorOutdoor.length > 0 ||
    f.vegan ||
    f.vegetarian ||
    f.categories.length > 0
  );
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
    if (f.timesOfDay.length && !f.timesOfDay.includes(timeOfDay(ev.start))) return false;
    if (f.freeOnly && !/free/i.test(ev.price)) return false;
    if (f.budgets.length && !f.budgets.includes(ev.budget)) return false;
    if (f.categories.length && !f.categories.includes(ev.category)) return false;

    if (f.indoorOutdoor.length) {
      // "both" events match either indoor or outdoor selection.
      const ok = f.indoorOutdoor.some((sel) => ev.indoor_outdoor === sel || ev.indoor_outdoor === "both");
      if (!ok) return false;
    }
    if (f.vegan && ev.vegan !== "yes") return false;
    if (f.vegetarian && ev.vegetarian !== "yes") return false;

    if (f.distanceBands.length) {
      if (typeof ev.lat !== "number" || typeof ev.lon !== "number") return false;
      const d = distanceFrom(origin, ev.lat, ev.lon);
      if (!d || !f.distanceBands.includes(bandFor(d.miles))) return false;
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
