#!/usr/bin/env -S npx tsx
// Schema + integrity validation for data/events.json (and link health with
// --check-links). Exits non-zero on errors so run.sh can abort before commit.
//
// Usage:
//   npm run validate            # offline: schema, enums, window, dup ids
//   npm run validate:links      # also HTTP-check booking/info/image urls (2xx)

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUDGETS,
  COVERAGE_CATEGORIES,
  INDOOR_OUTDOOR,
  YES_NO_UNKNOWN,
  type EventsStore,
  type TriangleEvent,
} from "./lib/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "events.json");

export interface DateWindow {
  start: Date; // inclusive (start of today, local)
  end: Date; // inclusive (today + 7 days)
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const URL_RE = /^https?:\/\/[^\s]+$/i;

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function req(ev: Partial<TriangleEvent>, field: keyof TriangleEvent, label: string, errors: string[]): void {
  const v = ev[field];
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    errors.push(`${label}: missing required field "${String(field)}"`);
  }
}

/** Pure validator — no I/O. `window` is optional; omit to skip the date-window check. */
export function validateEvents(events: TriangleEvent[], window?: DateWindow): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(events)) {
    return { errors: ["events.json: `events` is not an array"], warnings };
  }
  if (events.length === 0) {
    warnings.push("events.json has 0 events (empty store — expected before the first real run)");
  }

  const seen = new Map<string, number>();

  events.forEach((ev, i) => {
    const label = `event[${i}]${ev?.name ? ` "${ev.name}"` : ""}`;

    req(ev, "id", label, errors);
    req(ev, "name", label, errors);
    req(ev, "venue", label, errors);
    req(ev, "city", label, errors);
    req(ev, "start", label, errors);

    // Unique id
    if (ev.id) {
      const prior = seen.get(ev.id);
      if (prior !== undefined) errors.push(`${label}: duplicate id "${ev.id}" (also event[${prior}])`);
      else seen.set(ev.id, i);
    }

    // Category
    if (ev.category && !COVERAGE_CATEGORIES.includes(ev.category as (typeof COVERAGE_CATEGORIES)[number])) {
      warnings.push(`${label}: category "${ev.category}" is outside the coverage list`);
    }

    // Enums
    if (ev.budget !== undefined && !BUDGETS.includes(ev.budget)) {
      errors.push(`${label}: budget "${ev.budget}" not one of ${BUDGETS.join(" | ")}`);
    }
    if (ev.indoor_outdoor !== undefined && !INDOOR_OUTDOOR.includes(ev.indoor_outdoor)) {
      errors.push(`${label}: indoor_outdoor "${ev.indoor_outdoor}" invalid`);
    }
    if (ev.vegan !== undefined && !YES_NO_UNKNOWN.includes(ev.vegan)) {
      errors.push(`${label}: vegan "${ev.vegan}" invalid`);
    }
    if (ev.vegetarian !== undefined && !YES_NO_UNKNOWN.includes(ev.vegetarian)) {
      errors.push(`${label}: vegetarian "${ev.vegetarian}" invalid`);
    }

    // Coordinates
    if (ev.lat !== null && ev.lat !== undefined && !isFiniteNum(ev.lat)) {
      errors.push(`${label}: lat is not a number or null`);
    }
    if (ev.lon !== null && ev.lon !== undefined && !isFiniteNum(ev.lon)) {
      errors.push(`${label}: lon is not a number or null`);
    }

    // Dates
    const start = ev.start ? new Date(ev.start) : null;
    const end = ev.end ? new Date(ev.end) : null;
    if (start && Number.isNaN(start.getTime())) errors.push(`${label}: start "${ev.start}" is not a valid date`);
    if (end && Number.isNaN(end.getTime())) errors.push(`${label}: end "${ev.end}" is not a valid date`);
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
      errors.push(`${label}: end is before start`);
    }
    if (window && start && !Number.isNaN(start.getTime())) {
      if (start < window.start || start > window.end) {
        warnings.push(`${label}: start ${ev.start} is outside the today..+7d window`);
      }
    }

    // Link / image presence (warn only — link health is the --check-links job)
    for (const f of ["booking_url", "info_url", "image_url"] as const) {
      const v = ev[f];
      if (v && v !== "unknown" && !URL_RE.test(v)) {
        warnings.push(`${label}: ${f} "${v}" does not look like a URL`);
      }
    }
    if ((!ev.booking_url || ev.booking_url === "unknown") && (!ev.info_url || ev.info_url === "unknown")) {
      warnings.push(`${label}: no booking_url or info_url`);
    }
    if (!ev.image_url || ev.image_url === "unknown") {
      warnings.push(`${label}: no image_url (card will use a placeholder)`);
    }

    // Outdoor events should carry a forecast
    if ((ev.indoor_outdoor === "outdoor" || ev.indoor_outdoor === "both") && !ev.weather) {
      warnings.push(`${label}: outdoor event has no weather forecast`);
    }
  });

  return { errors, warnings };
}

function todayWindow(now: Date): DateWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function checkUrl(url: string): Promise<{ url: string; ok: boolean; status: number | string }> {
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow" });
    // Some hosts reject HEAD; fall back to a ranged GET.
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "follow" });
    }
    return { url, ok: res.ok, status: res.status };
  } catch (err) {
    return { url, ok: false, status: err instanceof Error ? err.message : "fetch error" };
  }
}

async function checkLinks(events: TriangleEvent[]): Promise<string[]> {
  const problems: string[] = [];
  const targets: Array<{ label: string; field: string; url: string }> = [];
  events.forEach((ev, i) => {
    const label = `event[${i}] "${ev.name}"`;
    for (const field of ["booking_url", "info_url", "image_url"] as const) {
      const url = ev[field];
      if (url && url !== "unknown" && URL_RE.test(url)) targets.push({ label, field, url });
    }
  });
  const results = await Promise.allSettled(targets.map((t) => checkUrl(t.url)));
  results.forEach((r, i) => {
    const t = targets[i]!;
    if (r.status === "fulfilled" && !r.value.ok) {
      problems.push(`${t.label}: ${t.field} -> ${r.value.status} (${t.url})`);
    } else if (r.status === "rejected") {
      problems.push(`${t.label}: ${t.field} -> error (${t.url})`);
    }
  });
  return problems;
}

async function main(): Promise<void> {
  const checkLinksFlag = process.argv.includes("--check-links");
  const raw = await readFile(SRC, "utf8");
  const store = JSON.parse(raw) as EventsStore;
  const events = Array.isArray(store.events) ? store.events : [];

  const { errors, warnings } = validateEvents(events, todayWindow(new Date()));

  for (const w of warnings) console.warn(`  warn: ${w}`);
  for (const e of errors) console.error(`  ERROR: ${e}`);

  let linkProblems: string[] = [];
  if (checkLinksFlag) {
    console.log("validate: checking link health (booking/info/image)…");
    linkProblems = await checkLinks(events);
    for (const p of linkProblems) console.error(`  LINK: ${p}`);
  }

  const hardErrors = errors.length + linkProblems.length;
  console.log(
    `validate: ${events.length} event(s), ${errors.length} error(s), ${warnings.length} warning(s)` +
      (checkLinksFlag ? `, ${linkProblems.length} link issue(s)` : ""),
  );
  if (hardErrors > 0) process.exit(1);
}

// Only run the CLI when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("validate failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
