#!/usr/bin/env -S npx tsx
// Schema + integrity validation for data/events.json (and link health with
// --check-links). Exits non-zero on errors so run.sh can abort before commit.
//
// Usage:
//   npm run validate            # offline: schema, enums, window, dup ids,
//                               #   data/sources.json, data/source_coverage.json
//   npm run validate:links      # also HTTP-check booking/info/image urls and
//                               #   every registry source url (2xx)

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUDGETS,
  COVERAGE_CATEGORIES,
  FEED_SCOPES,
  FEED_TYPES,
  INDOOR_OUTDOOR,
  INGEST_MODES,
  SOURCE_KINDS,
  YES_NO_UNKNOWN,
  type EventSource,
  type EventsStore,
  type FeedScope,
  type FeedType,
  type SourceCoverage,
  type SourceIngest,
  type SourceKind,
  type SourcesRegistry,
  type TriangleEvent,
} from "./lib/types.js";
import { normVenue, venueParent } from "./lib/dedup.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "events.json");
const SOURCES = join(ROOT, "data", "sources.json");
const COVERAGE = join(ROOT, "data", "source_coverage.json");

/** Fraction of a run's events that must come from outside the registry. */
const OFF_REGISTRY_QUOTA = 0.4;
/** Distinct off-registry domains a run must draw from (prompts/weekly.md § step 3). */
const OFF_REGISTRY_MIN_SOURCES = 8;

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

/**
 * True for the endpoint every WordPress site advertises via
 * `<link rel="alternate">`: `/feed/`, `/events/feed/`, `?feed=rss2`. Those are
 * blog feeds — press releases, auditions, job openings — never event feeds. See
 * FEED_TYPES in lib/types.ts.
 */
function isWordPressBlogFeed(url: string): boolean {
  try {
    const u = new URL(url);
    const last = u.pathname.replace(/\/+$/, "").split("/").pop()?.toLowerCase();
    return last === "feed" || u.searchParams.has("feed");
  } catch {
    return false;
  }
}

/** Errors for one source's `ingest` hint. Empty when it is well-formed or absent. */
function ingestErrors(ingest: unknown, label: string): string[] {
  if (typeof ingest !== "object" || ingest === null || Array.isArray(ingest)) {
    return [`${label}: ingest must be an object, got ${Array.isArray(ingest) ? "array" : typeof ingest}`];
  }
  const errors: string[] = [];
  const hint = ingest as Partial<SourceIngest>;

  if (!INGEST_MODES.includes(hint.mode as (typeof INGEST_MODES)[number])) {
    // Return early: every field below belongs to the "feed" mode's shape, and a
    // future mode will carry its own.
    return [`${label}: ingest.mode "${String(hint.mode)}" is not one of ${INGEST_MODES.join(", ")}`];
  }

  if (typeof hint.feed_url !== "string" || !URL_RE.test(hint.feed_url)) {
    errors.push(`${label}: ingest.feed_url must be an http(s) url, got ${JSON.stringify(hint.feed_url)}`);
  } else if (isWordPressBlogFeed(hint.feed_url)) {
    errors.push(
      `${label}: ingest.feed_url "${hint.feed_url}" is a WordPress blog feed, not an event feed — ` +
        `those carry press releases, auditions and job openings, and none of their items has an ` +
        `event start time. Drop the declaration and let Phase A read the page instead.`,
    );
  }

  if (!FEED_TYPES.includes(hint.feed_type as FeedType)) {
    errors.push(
      `${label}: ingest.feed_type "${String(hint.feed_type)}" is not one of ${FEED_TYPES.join(", ")}`,
    );
  }

  if (hint.feed_scope !== undefined && !FEED_SCOPES.includes(hint.feed_scope as FeedScope)) {
    errors.push(
      `${label}: ingest.feed_scope "${String(hint.feed_scope)}" is not one of ${FEED_SCOPES.join(", ")}`,
    );
  }
  return errors;
}

/**
 * Pure validator for data/sources.json — no I/O. The parent_venue check is the
 * anti-drift guard: dedup.ts owns VENUE_PARENTS and must already know any
 * complex the registry references, or cross-source duplicates slip through.
 */
export function validateSources(registry: SourcesRegistry): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sources = Array.isArray(registry?.sources) ? registry.sources : null;
  if (!sources) return { errors: ["sources.json: `sources` is not an array"], warnings };
  if (sources.length === 0) warnings.push("sources.json has 0 sources (registry is empty)");

  const seen = new Map<string, number>();
  sources.forEach((s, i) => {
    const label = `source[${i}] "${s?.name ?? s?.id ?? "?"}"`;

    for (const field of ["id", "name", "url", "city"] as const) {
      const v = s?.[field];
      if (typeof v !== "string" || v.trim() === "") {
        errors.push(`${label}: missing required field "${field}"`);
      }
    }

    if (typeof s?.id === "string" && s.id.trim() !== "") {
      const prev = seen.get(s.id);
      if (prev !== undefined) errors.push(`${label}: duplicate source id "${s.id}" (also source[${prev}])`);
      else seen.set(s.id, i);
      if (!/^[a-z0-9-]+$/.test(s.id)) errors.push(`${label}: id "${s.id}" is not kebab-case`);
    }

    if (typeof s?.url === "string" && !URL_RE.test(s.url)) {
      errors.push(`${label}: url is not a valid http(s) url ("${s.url}")`);
    }

    if (!SOURCE_KINDS.includes(s?.kind as SourceKind)) {
      errors.push(`${label}: kind "${String(s?.kind)}" is not one of ${SOURCE_KINDS.join(", ")}`);
    }

    if (!Array.isArray(s?.categories) || s.categories.length === 0) {
      errors.push(`${label}: categories must be a non-empty array`);
    } else {
      for (const c of s.categories) {
        if (!COVERAGE_CATEGORIES.includes(c as (typeof COVERAGE_CATEGORIES)[number])) {
          warnings.push(`${label}: category "${c}" is not a CLAUDE.md coverage category`);
        }
      }
    }

    if (s?.fetch_blocked !== undefined && typeof s.fetch_blocked !== "boolean") {
      // A string here is the dangerous case: "false" is truthy, so the link
      // checker would SKIP the source — the opposite of what the author meant.
      errors.push(`${label}: fetch_blocked must be a boolean, got ${typeof s.fetch_blocked}`);
    }

    if (s?.ingest !== undefined) errors.push(...ingestErrors(s.ingest, label));

    // Anti-drift: dedup.ts must already resolve THIS source's own name to the
    // parent it declares. A parent invented in the registry alone resolves to
    // null here and fails, which is the point.
    if (typeof s?.parent_venue === "string" && s.parent_venue.trim() !== "") {
      if (venueParent(s.name ?? "") !== normVenue(s.parent_venue)) {
        errors.push(
          `${label}: parent_venue "${s.parent_venue}" has no matching VENUE_PARENTS entry in ` +
            `scripts/lib/dedup.ts — add it there, or cross-source duplicates for this venue won't merge`,
        );
      }
    }

    if (s?.venue_aliases !== undefined) {
      if (!Array.isArray(s.venue_aliases) || s.venue_aliases.some((a) => typeof a !== "string" || a.trim() === "")) {
        errors.push(`${label}: venue_aliases must be an array of non-empty strings`);
      } else {
        // Symmetric anti-drift: an alias is only useful if dedup.ts canonicalizes
        // it onto THIS source's own venue. An alias that normalizes to something
        // else buys nothing (venue Jaccard never reaches 0.6 on a shorthand) and
        // silently advertises a merge that will not happen. Sharing a parent
        // complex is deliberately NOT an escape hatch: sibling halls of one
        // building are exactly the pair VENUE_PARENTS keeps apart, so an alias
        // across them must fail here too.
        const canonical = normVenue(s.name ?? "");
        for (const alias of s.venue_aliases) {
          if (normVenue(alias) !== canonical) {
            errors.push(
              `${label}: venue_aliases entry "${alias}" normalizes to "${normVenue(alias)}", not ` +
                `"${canonical}" — add it to VENUE_ALIASES in scripts/lib/dedup.ts or drop it, ` +
                `otherwise listings under that name won't merge`,
            );
          }
        }
      }
    }
  });

  return { errors, warnings };
}

/** The run a coverage report claims to describe (from data/events.json). */
export interface CoverageRun {
  /** The written store's envelope `week`. Null skips the staleness check. */
  week: string | null;
  /** How many events the written store actually contains. */
  eventCount: number;
}

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/**
 * Pure validator for data/source_coverage.json — no I/O. Posture, per the design
 * doc: the file is "a signal for a human, not an audit", so quota shortfalls and
 * un-reported seeds are WARNINGS. What IS an error is a report that does not
 * describe this run at all — a stale `week`, or counts that contradict the store
 * it was written beside. Those make every other number meaningless.
 */
export function validateCoverage(
  coverage: SourceCoverage,
  registry: SourcesRegistry,
  run: CoverageRun,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const registrySources = Array.isArray(registry?.sources) ? registry.sources : [];
  const known = new Set(registrySources.map((s) => s.id));
  const perSource = coverage?.per_source ?? {};

  // --- Does this report describe THIS run? ---------------------------------
  // The file is committed, so without this a run that forgot to rewrite it
  // revalidates last week's telemetry and passes clean.
  if (typeof coverage?.week !== "string" || coverage.week.trim() === "") {
    errors.push('source_coverage.json: missing "week"');
  } else if (run.week && coverage.week !== run.week) {
    errors.push(
      `source_coverage.json: week "${coverage.week}" is not this run's week "${run.week}" — ` +
        `the report describes an earlier run; rewrite it alongside data/events.json`,
    );
  }

  // --- per_source keys and counts ------------------------------------------
  let perSourceTotal = 0;
  let countsUsable = true;
  for (const [id, n] of Object.entries(perSource)) {
    if (!known.has(id)) errors.push(`source_coverage.json: per_source id "${id}" is not in sources.json`);
    if (!isCount(n)) {
      errors.push(
        `source_coverage.json: per_source["${id}"] must be a non-negative integer, got ${JSON.stringify(n)}`,
      );
      countsUsable = false;
    } else {
      perSourceTotal += n;
    }
  }

  for (const id of coverage?.zero_hit ?? []) {
    const n = perSource[id];
    if (n === undefined) {
      errors.push(`source_coverage.json: zero_hit id "${id}" is missing from per_source`);
    } else if (n !== 0) {
      errors.push(`source_coverage.json: zero_hit id "${id}" reported ${n} event(s)`);
    }
  }

  // A seed absent from per_source was never reported on — the exact silent
  // failure this file exists to surface. Warning: a run may legitimately skip a
  // source (fetch down, timed out) and should still publish.
  const unreported = [...known].filter((id) => !(id in perSource));
  if (unreported.length > 0) {
    const shown = unreported.slice(0, 10).join(", ");
    const more = unreported.length > 10 ? `, +${unreported.length - 10} more` : "";
    warnings.push(
      `source_coverage.json: ${unreported.length} registry source(s) missing from per_source ` +
        `(not swept, or not reported): ${shown}${more}`,
    );
  }

  // --- Arithmetic invariants ------------------------------------------------
  const total = coverage?.total_events;
  const offEvents = coverage?.off_registry_events;
  const offSources = coverage?.off_registry_sources;

  for (const [field, v] of [
    ["total_events", total],
    ["off_registry_events", offEvents],
    ["off_registry_sources", offSources],
  ] as const) {
    if (!isCount(v)) {
      errors.push(`source_coverage.json: ${field} must be a non-negative integer, got ${JSON.stringify(v)}`);
    }
  }
  if (!isCount(total) || !isCount(offEvents) || !isCount(offSources)) return { errors, warnings };

  if (total !== run.eventCount) {
    errors.push(
      `source_coverage.json: total_events ${total} does not match the ${run.eventCount} event(s) ` +
        `written to data/events.json`,
    );
  }
  if (countsUsable && perSourceTotal + offEvents !== total) {
    errors.push(
      `source_coverage.json: per_source total (${perSourceTotal}) + off_registry_events (${offEvents}) ` +
        `= ${perSourceTotal + offEvents}, but total_events is ${total} — the counts do not add up`,
    );
  }
  if (offEvents > 0 && offSources === 0) {
    errors.push(
      `source_coverage.json: off_registry_sources is 0 but off_registry_events is ${offEvents}`,
    );
  }

  // --- Quota (advisory) -----------------------------------------------------
  if (total > 0) {
    const share = offEvents / total;
    if (share < OFF_REGISTRY_QUOTA) {
      warnings.push(
        `source_coverage.json: off-registry share ${(share * 100).toFixed(0)}% is below the ` +
          `${OFF_REGISTRY_QUOTA * 100}% quota — Phase B discovery may be getting crowded out`,
      );
    }
  }
  if (offSources < OFF_REGISTRY_MIN_SOURCES) {
    warnings.push(
      `source_coverage.json: ${offSources} distinct off-registry source(s), below the ` +
        `${OFF_REGISTRY_MIN_SOURCES}-source floor — Phase B discovery may be getting crowded out`,
    );
  }

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

/**
 * HTTP-check registry URLs. Sources marked fetch_blocked are skipped: their
 * origin 403s a scripted fetch but serves fine through WebFetch, and failing
 * the build on them would abort a healthy weekly run.
 *
 * A declared `ingest.feed_url` is checked too, and NOT skipped for a
 * fetch_blocked source: the whole point of a feed endpoint is that a plain
 * fetch reaches it, so a 403 there is real news.
 */
async function checkSourceLinks(sources: EventSource[]): Promise<string[]> {
  const problems: string[] = [];
  const targets: Array<{ id: string; field: string; url: string }> = [];
  for (const s of sources) {
    if (!s.fetch_blocked && URL_RE.test(s.url ?? "")) targets.push({ id: s.id, field: "url", url: s.url });
    const feedUrl = s.ingest?.feed_url;
    if (feedUrl && URL_RE.test(feedUrl)) targets.push({ id: s.id, field: "ingest.feed_url", url: feedUrl });
  }
  const skipped = sources.filter((s) => s.fetch_blocked).length;
  if (skipped > 0) console.log(`validate: skipping ${skipped} fetch_blocked source(s)`);

  const results = await Promise.allSettled(targets.map((t) => checkUrl(t.url)));
  results.forEach((r, i) => {
    const t = targets[i]!;
    if (r.status === "fulfilled" && !r.value.ok) {
      problems.push(`source "${t.id}" ${t.field}: ${r.value.status} (${t.url})`);
    } else if (r.status === "rejected") {
      problems.push(`source "${t.id}" ${t.field}: fetch error (${t.url})`);
    }
  });
  return problems;
}

async function main(): Promise<void> {
  const checkLinksFlag = process.argv.includes("--check-links");
  const raw = await readFile(SRC, "utf8");
  const store = JSON.parse(raw) as EventsStore;
  const events = Array.isArray(store.events) ? store.events : [];

  const eventResult = validateEvents(events, todayWindow(new Date()));
  const errors = [...eventResult.errors];
  const warnings = [...eventResult.warnings];

  const rawSources = await readFile(SOURCES, "utf8");
  const registry = JSON.parse(rawSources) as SourcesRegistry;
  const srcResult = validateSources(registry);
  errors.push(...srcResult.errors);
  warnings.push(...srcResult.warnings);
  // validateSources already reported a non-array `sources`; don't compound a
  // clean validation error with a TypeError further down.
  const registrySources = Array.isArray(registry?.sources) ? registry.sources : [];

  try {
    const rawCoverage = await readFile(COVERAGE, "utf8");
    const cov = validateCoverage(JSON.parse(rawCoverage) as SourceCoverage, registry, {
      week: store.week ?? null,
      eventCount: events.length,
    });
    errors.push(...cov.errors);
    warnings.push(...cov.warnings);
  } catch (err) {
    // ENOENT is expected before the first run under the new prompt. Anything
    // else (malformed JSON, unreadable file) is a real problem — surface it.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      errors.push(`source_coverage.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const w of warnings) console.warn(`  warn: ${w}`);
  for (const e of errors) console.error(`  ERROR: ${e}`);

  let linkProblems: string[] = [];
  if (checkLinksFlag) {
    console.log("validate: checking link health (booking/info/image + sources)…");
    linkProblems = [...(await checkLinks(events)), ...(await checkSourceLinks(registrySources))];
    for (const p of linkProblems) console.error(`  LINK: ${p}`);
  }

  const hardErrors = errors.length + linkProblems.length;
  console.log(
    `validate: ${events.length} event(s), ${registrySources.length} source(s), ` +
      `${errors.length} error(s), ${warnings.length} warning(s)` +
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
