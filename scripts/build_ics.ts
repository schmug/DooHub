#!/usr/bin/env -S npx tsx
// data/events.json -> public/events.ics
//
// Usage: npm run build:ics   (or: tsx scripts/build_ics.ts)
// Reads the canonical store, emits a single RFC 5545 calendar. Idempotent: the
// stable UID (= event id) means subscribers see updates, not duplicates.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIcs } from "./lib/ics.js";
import type { EventsStore } from "./lib/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "events.json");
const OUT = join(ROOT, "public", "events.ics");

async function main(): Promise<void> {
  const raw = await readFile(SRC, "utf8");
  const store = JSON.parse(raw) as EventsStore;
  const events = Array.isArray(store.events) ? store.events : [];

  const ics = buildIcs(events, { now: new Date() });

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, ics, "utf8");

  console.log(`build_ics: wrote ${events.length} VEVENT(s) -> ${OUT}`);
}

main().catch((err) => {
  console.error("build_ics failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
