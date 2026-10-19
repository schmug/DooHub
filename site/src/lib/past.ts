import type { TriangleEvent } from "../types";
import { nyMinuteOfDay } from "./format";
import { isAllDayOrTbd } from "./timeRange";

/** Assumed length of a timed event that has neither `end` nor `duration_min`. */
export const DEFAULT_LENGTH_MIN = 120;

const MIN = 60_000;

/**
 * When an event is over, in epoch ms. A usable `end` wins. Without one, an
 * all-day / time-TBD event runs to the end of its NY-local day (so "time TBD"
 * never disappears in the morning), and a timed event runs `duration_min` or
 * DEFAULT_LENGTH_MIN past its start.
 */
export function endMs(ev: TriangleEvent): number {
  const start = Date.parse(ev.start);
  const end = ev.end ? Date.parse(ev.end) : NaN;
  if (end > start) return end;
  if (isAllDayOrTbd(ev)) return start + (24 * 60 - nyMinuteOfDay(ev.start)) * MIN;
  const dur = ev.duration_min && ev.duration_min > 0 ? ev.duration_min : DEFAULT_LENGTH_MIN;
  return start + dur * MIN;
}

export function isOver(ev: TriangleEvent, now: number): boolean {
  return endMs(ev) <= now;
}
