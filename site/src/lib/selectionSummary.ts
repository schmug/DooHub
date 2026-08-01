// Running totals for the hand-picked set, shown in the selection sidebar header.
//
// Prices in events.json are human strings ("Free", "$15", "$10-$25", "unknown")
// because that's what the sources publish and CLAUDE.md forbids inventing a
// number we can't verify. Summarizing them therefore means parsing, and parsing
// means some prices won't yield a figure — which the summary has to admit to
// rather than quietly leave out.

import type { TriangleEvent } from "../types";
import { dayKey, formatWeekdayShort } from "./format";

export interface PriceRange {
  min: number;
  max: number;
}

export interface SelectionSummary {
  count: number;
  /** "SAT", or "FRI–SUN" across a span. Empty when nothing is picked. */
  daySpan: string;
  /** "Free", "$15", "$0–$65". Suffixed "+" when a pick's price didn't parse. */
  costRange: string;
}

/**
 * Pull a low/high figure out of a human price string.
 *
 * Takes every dollar figure it can find and spans them, which handles single
 * prices, ranges, and multi-tier listings ("$25 ADV / $30 DOS") with one rule.
 * A "free" mention contributes a 0 rather than short-circuiting, so "Free-$10"
 * spans 0–10 instead of reporting only the paid tier. Returns null when there
 * is no figure at all ("unknown", "Varies") — the caller must not treat that
 * as zero.
 */
export function parsePrice(price: string): PriceRange | null {
  if (!price) return null;
  const figures: number[] = [];
  for (const m of price.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)) {
    const digits = m[1];
    if (!digits) continue;
    const n = Number(digits.replace(/,/g, ""));
    if (Number.isFinite(n)) figures.push(n);
  }
  if (/\bfree\b/i.test(price)) figures.push(0);
  if (figures.length === 0) return null;
  return { min: Math.min(...figures), max: Math.max(...figures) };
}

function formatMoney(n: number): string {
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

function costRangeOf(picked: TriangleEvent[]): string {
  const parsed = picked.map((ev) => parsePrice(ev.price));
  const known = parsed.filter((r): r is PriceRange => r !== null);
  if (known.length === 0) return "";

  const min = Math.min(...known.map((r) => r.min));
  const max = Math.max(...known.map((r) => r.max));
  // Never understate: if a pick's price was unreadable, say the total is at least this.
  const suffix = known.length < parsed.length ? "+" : "";

  if (min === 0 && max === 0) return `Free${suffix}`;
  if (min === max) return `${formatMoney(min)}${suffix}`;
  return `${formatMoney(min)}–${formatMoney(max)}${suffix}`;
}

function daySpanOf(picked: TriangleEvent[]): string {
  // Sorted defensively rather than trusting the caller — selectedEvents already
  // returns chronological order, but the summary shouldn't depend on that.
  const sorted = [...picked].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return "";
  if (dayKey(first.start) === dayKey(last.start)) return formatWeekdayShort(first.start);
  return `${formatWeekdayShort(first.start)}–${formatWeekdayShort(last.start)}`;
}

/** Count, day span, and cost range for the picked set. */
export function summarizeSelection(picked: TriangleEvent[]): SelectionSummary {
  if (picked.length === 0) return { count: 0, daySpan: "", costRange: "" };
  return {
    count: picked.length,
    daySpan: daySpanOf(picked),
    costRange: costRangeOf(picked),
  };
}
