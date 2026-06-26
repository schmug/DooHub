#!/usr/bin/env -S npx tsx
// One-off seeder: turns data/_candidates.json (raw discovery output) into the
// canonical data/events.json store. Enriches weather, computes stable ids via
// the tested dedup helpers, folds duplicates, and snapshots the archive.
//
// Usage: tsx scripts/seed_events.ts
//
// This is the manual equivalent of step 4-7 of prompts/weekly.md for a from-empty
// run. computeId / isSameOccurrence come straight from scripts/lib/dedup.ts so the
// documented dedup rules and the actual behavior can't drift.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeId, isSameOccurrence, localDate } from "./lib/dedup.js";
import type { EventsStore, TriangleEvent, Weather } from "./lib/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANDIDATES = join(ROOT, "data", "_candidates.json");
const OUT = join(ROOT, "data", "events.json");

const WEEK = "2026-W26";
const NOW = "2026-06-25T20:30:00-04:00";

// Real NWS forecast (api.weather.gov gridpoint RAH/75,57) pulled for this run's
// window. Keyed by local (America/New_York) date. No daytime period was
// available for 2026-06-25 (already evening at run time), so those events keep
// weather: null.
const FORECAST: Record<string, Weather> = {
  "2026-06-26": { summary: "Mostly sunny, PM storms", temp_f: 96 },
  "2026-06-27": { summary: "Partly sunny, PM storms", temp_f: 97 },
  "2026-06-28": { summary: "Mostly sunny, slight PM storms", temp_f: 96 },
  "2026-06-29": { summary: "Mostly sunny", temp_f: 92 },
  "2026-06-30": { summary: "Sunny", temp_f: 95 },
  "2026-07-01": { summary: "Sunny", temp_f: 99 },
  "2026-07-02": { summary: "Sunny", temp_f: 101 },
};

type Candidate = Omit<TriangleEvent, "id" | "first_seen" | "last_verified" | "weather">;

function enrich(c: Candidate): TriangleEvent {
  const outdoorish = c.indoor_outdoor === "outdoor" || c.indoor_outdoor === "both";
  const weather = outdoorish ? FORECAST[localDate(c.start)] ?? null : null;
  return {
    ...c,
    id: computeId(c),
    weather,
    first_seen: NOW,
    last_verified: NOW,
  };
}

/** Merge `loser` into `winner`: union tags, earliest first_seen, latest last_verified, fill unknowns. */
function merge(winner: TriangleEvent, loser: TriangleEvent): TriangleEvent {
  const tags = [...new Set([...winner.tags, ...loser.tags])];
  const fillable: (keyof TriangleEvent)[] = [
    "address", "lat", "lon", "price", "budget", "image_url", "booking_url",
    "info_url", "description", "vegan", "vegetarian", "weather", "duration_min", "end",
  ];
  const out: TriangleEvent = { ...winner, tags };
  for (const f of fillable) {
    const wv = out[f];
    const isUnknown = wv === undefined || wv === null || wv === "" || wv === "unknown";
    if (isUnknown && loser[f] !== undefined && loser[f] !== null && loser[f] !== "" && loser[f] !== "unknown") {
      (out as unknown as Record<string, unknown>)[f] = loser[f];
    }
  }
  out.first_seen = winner.first_seen < loser.first_seen ? winner.first_seen : loser.first_seen;
  out.last_verified = winner.last_verified > loser.last_verified ? winner.last_verified : loser.last_verified;
  return out;
}

async function main(): Promise<void> {
  const raw = await readFile(CANDIDATES, "utf8");
  const candidates = JSON.parse(raw) as Candidate[];

  const byId = new Map<string, TriangleEvent>();
  const accepted: TriangleEvent[] = [];
  let merged = 0;

  for (const c of candidates) {
    const ev = enrich(c);
    const existing = byId.get(ev.id);
    if (existing) {
      const updated = merge(existing, ev);
      byId.set(ev.id, updated);
      accepted[accepted.indexOf(existing)] = updated;
      merged++;
      continue;
    }
    const dupIdx = accepted.findIndex((a) => isSameOccurrence(a, ev));
    if (dupIdx >= 0) {
      const updated = merge(accepted[dupIdx]!, ev);
      byId.delete(accepted[dupIdx]!.id);
      byId.set(updated.id, updated);
      accepted[dupIdx] = updated;
      merged++;
      continue;
    }
    byId.set(ev.id, ev);
    accepted.push(ev);
  }

  accepted.sort((a, b) => a.start.localeCompare(b.start));

  const store: EventsStore = {
    schema_version: 1,
    generated_at: NOW,
    week: WEEK,
    origin: { name: "Downtown Raleigh, NC", lat: 35.7796, lon: -78.6382 },
    events: accepted,
  };

  await writeFile(OUT, JSON.stringify(store, null, 2) + "\n", "utf8");

  const archiveDir = join(ROOT, "data", "archive");
  await mkdir(archiveDir, { recursive: true });
  await writeFile(join(archiveDir, `${WEEK}.json`), JSON.stringify(store, null, 2) + "\n", "utf8");

  console.log(
    `seed_events: ${candidates.length} candidate(s) -> ${accepted.length} event(s) ` +
      `(${merged} merged) -> ${OUT}`,
  );
}

main().catch((err) => {
  console.error("seed_events failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
