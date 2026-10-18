import type { TriangleEvent } from "../types";
import { nyMinuteOfDay } from "./format";

/**
 * Start-time range filter. Values are NY-local minutes after midnight. The
 * slider runs 6 AM → midnight in 30-minute steps; a handle parked at either
 * end means "no bound" on that side, so the full range filters nothing (and
 * the handful of pre-6 AM starts still show).
 */
export const TIME_MIN = 6 * 60;
export const TIME_MAX = 24 * 60;
export const TIME_STEP = 30;

export type TimeRange = [number, number];

export const FULL_TIME_RANGE: TimeRange = [TIME_MIN, TIME_MAX];

/** One-tap presets that just snap the handles. */
export const TIME_PRESETS: { label: string; range: TimeRange }[] = [
  { label: "Morning", range: [TIME_MIN, 12 * 60] },
  { label: "Afternoon", range: [12 * 60, 17 * 60] },
  { label: "Evening", range: [17 * 60, TIME_MAX] },
];

export function isFullTimeRange([lo, hi]: TimeRange): boolean {
  return lo <= TIME_MIN && hi >= TIME_MAX;
}

/**
 * All-day or time-TBD: a midnight start (how sources encode "no time") or an
 * explicit `time-tbd` tag. These have no meaningful start time to range over.
 */
export function isAllDayOrTbd(ev: TriangleEvent): boolean {
  return ev.tags.includes("time-tbd") || nyMinuteOfDay(ev.start) === 0;
}

export function matchesTimeRange(ev: TriangleEvent, [lo, hi]: TimeRange, includeAllDay: boolean): boolean {
  if (isAllDayOrTbd(ev)) return includeAllDay;
  const m = nyMinuteOfDay(ev.start);
  if (lo > TIME_MIN && m < lo) return false;
  if (hi < TIME_MAX && m >= hi) return false;
  return true;
}

/** "6 AM", "12:30 PM", "Midnight" — slider readout. */
export function formatMinutes(m: number): string {
  if (m >= TIME_MAX || m === 0) return "Midnight";
  if (m === 12 * 60) return "Noon";
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const h12 = h24 % 12 || 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return min === 0 ? `${h12} ${ampm}` : `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}
