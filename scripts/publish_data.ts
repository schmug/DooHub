#!/usr/bin/env -S npx tsx
// Copy the canonical JSON stores into public/ so the built site can fetch them
// at runtime (/events.json, /itineraries.json). Run AFTER the vite build, which
// empties public/.
//
// Usage: npm run build:data   (or: tsx scripts/publish_data.ts)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

const COPIES: Array<[string, string]> = [
  [join(ROOT, "data", "events.json"), join(PUBLIC, "events.json")],
  [join(ROOT, "data", "itineraries.json"), join(PUBLIC, "itineraries.json")],
];

async function main(): Promise<void> {
  await mkdir(PUBLIC, { recursive: true });
  for (const [src, dst] of COPIES) {
    const raw = await readFile(src, "utf8");
    JSON.parse(raw); // fail loudly on malformed JSON before publishing
    await writeFile(dst, raw, "utf8");
    console.log(`publish_data: ${src} -> ${dst}`);
  }
}

main().catch((err) => {
  console.error("publish_data failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
