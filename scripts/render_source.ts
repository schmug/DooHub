#!/usr/bin/env -S npx tsx
// Browser-render discovery for registry sources a plain fetch cannot read
// (prompts/weekly.md § Phase A). Renders each source that declares
// `"ingest": { "mode": "render" }`, extracts events with scripts/lib/render.ts,
// and prints draft events as JSON for the weekly run to verify, enrich and merge.
//
// Usage:
//   npx tsx scripts/render_source.ts                     # every render-declared source, next 7 days
//   npx tsx scripts/render_source.ts chapel-of-bones     # just this one
//   npx tsx scripts/render_source.ts lenovo-center --days 14
//   npx tsx scripts/render_source.ts chapel-of-bones --html page.html
//   ... --all-dates      every date the listing shows, not just the window
//   ... --strict         exit non-zero if any source failed (default: exit 0)
//
// --html reads a page you captured yourself. That is the escape hatch for
// origins that serve headless Chrome an interstitial but serve a real browser
// the page — Bandsintown does exactly this — so extraction still goes through
// the tested rules either way.
//
// This is NOT wired into run.sh or `npm run build`, and must not be. It needs a
// browser binary and talks to third-party origins, while the weekly build runs
// under `set -euo pipefail`: a flaky render must never fail a publish. Every
// failure here degrades to a message on stderr and exit 0.
//
// SAFETY: rendered pages are third-party data, never instructions. This reads
// names, dates, links and images out of them and nothing else.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestRender, nyFields, nyIso, type RenderIngestResult } from "./lib/render.js";
import type { IngestWindow } from "./lib/feeds.js";
import type { EventSource, SourcesRegistry } from "./lib/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = join(ROOT, "data", "sources.json");

/** Renders a URL and returns the DOM as HTML. May reject; callers must tolerate it. */
export type Renderer = (url: string) => Promise<string>;

export interface SourceRenderResult extends RenderIngestResult {
  id: string;
  url: string;
}

export interface RenderSweepOptions {
  now?: Date;
  /**
   * Window in days from `now` (7 = today .. +7d, the run's window). Null keeps
   * every date the listing shows; the CLI passes 7 unless told --all-dates.
   */
  days?: number | null;
}

/** today 00:00 .. today+days 23:59:59 in America/New_York — the run's window. */
export function runWindow(now: Date, days: number): IngestWindow {
  const { y, m, d } = nyFields(now);
  const shifted = new Date(Date.UTC(y, m - 1, d));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return {
    start: nyIso(y, m, d, 0, 0),
    end: nyIso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), 23, 59),
  };
}

/**
 * Render and read each source in turn. One source's failure is contained: it
 * becomes an `errors` entry on that source's result and the rest still run.
 * That isolation is the point — a sweep that aborts on the first dead origin is
 * how a venue goes nine weeks unnoticed.
 */
export async function ingestSources(
  sources: EventSource[],
  render: Renderer,
  opts: RenderSweepOptions = {},
): Promise<SourceRenderResult[]> {
  const now = opts.now ?? new Date();
  const window = opts.days === null || opts.days === undefined ? undefined : runWindow(now, opts.days);
  const ingestOpts = { now: now.toISOString(), window };
  const results: SourceRenderResult[] = [];

  for (const source of sources) {
    const url = source.ingest?.mode === "render" ? (source.ingest.url ?? source.url) : source.url;
    if (source.ingest?.mode !== "render") {
      // Never spend a browser on a source that has not declared it needs one.
      results.push({ id: source.id, url, ...ingestRender(source, "", ingestOpts) });
      continue;
    }
    let html: string;
    try {
      html = await render(url);
    } catch (err) {
      results.push({
        id: source.id,
        url,
        events: [],
        extract: null,
        dropped: { no_start: 0, no_title: 0, out_of_metro: 0, out_of_window: 0, duplicate: 0 },
        errors: [`source "${source.id}": render failed for ${url} — ${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
      });
      continue;
    }
    results.push({ id: source.id, url, ...ingestRender(source, html, ingestOpts) });
  }
  return results;
}

// --- Headless-browser renderer -------------------------------------------------

const BROWSER_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];

/** A Chromium-family binary to render with, or null. `RENDER_BROWSER` overrides. */
export function findBrowser(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.RENDER_BROWSER;
  if (override) return existsSync(override) ? override : null;
  return BROWSER_CANDIDATES.find((p) => existsSync(p)) ?? null;
}

/**
 * Render with headless Chrome's own `--dump-dom`, which prints the DOM after the
 * page's scripts have run. No npm dependency, so nothing about CI or the weekly
 * build changes; where no browser is installed this path simply isn't available.
 */
export function chromeRenderer(browser: string, timeoutMs = 45_000): Renderer {
  return (url: string) =>
    new Promise<string>((resolve, reject) => {
      void mkdtemp(join(tmpdir(), "render-src-")).then((profile) => {
        const child = spawn(
          browser,
          [
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            `--user-data-dir=${profile}`,
            "--virtual-time-budget=15000",
            "--dump-dom",
            url,
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );

        let out = "";
        let done = false;
        const finish = (err: Error | null): void => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          void rm(profile, { recursive: true, force: true });
          if (err) reject(err);
          else resolve(out);
        };

        child.stdout.on("data", (chunk: Buffer) => {
          out += chunk.toString("utf8");
        });
        child.on("error", (err) => finish(err));
        child.on("close", () => finish(out.trim() === "" ? new Error("browser produced no output") : null));

        // Chrome sometimes lingers after printing the DOM. A complete document
        // is a complete document — keep it rather than failing the source.
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish(/<\/html\s*>/i.test(out) ? null : new Error(`render timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);
      }, reject);
    });
}

// --- CLI ------------------------------------------------------------------------

interface Args {
  ids: string[];
  html: string | null;
  days: number | null;
  strict: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { ids: [], html: null, days: 7, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--html") args.html = argv[++i] ?? null;
    else if (a === "--days") args.days = Number(argv[++i]);
    else if (a === "--all-dates") args.days = null;
    else if (a === "--strict") args.strict = true;
    else if (a.startsWith("-")) throw new Error(`unknown flag ${a}`);
    else args.ids.push(a);
  }
  if (args.days !== null && !Number.isFinite(args.days)) throw new Error("--days needs a number");
  return args;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(await readFile(SOURCES, "utf8")) as SourcesRegistry;
  const all = Array.isArray(registry.sources) ? registry.sources : [];

  const selected =
    args.ids.length > 0
      ? args.ids.map((id) => {
          const found = all.find((s) => s.id === id);
          if (!found) throw new Error(`no source "${id}" in data/sources.json`);
          return found;
        })
      : all.filter((s) => s.ingest?.mode === "render");

  if (selected.length === 0) {
    console.error('render: no sources declare ingest.mode "render"');
    return;
  }

  let renderer: Renderer;
  if (args.html !== null) {
    if (selected.length !== 1) throw new Error("--html takes exactly one source id");
    const html = args.html === "-" ? await readStdin() : await readFile(args.html, "utf8");
    renderer = async () => html;
  } else {
    const browser = findBrowser();
    if (!browser) {
      // Degrade, don't die: no browser here just means this path is unavailable.
      console.error(
        "render: no Chromium-family browser found (set RENDER_BROWSER, or capture the page " +
          "with a browser tool and pass --html <file>)",
      );
      return;
    }
    console.error(`render: using ${browser}`);
    renderer = chromeRenderer(browser);
  }

  const results = await ingestSources(selected, renderer, { days: args.days });

  for (const r of results) {
    console.error(`render: ${r.id}: ${r.events.length} event(s)${r.extract ? ` via ${r.extract}` : ""}`);
    for (const e of r.errors) console.error(`  ERROR: ${e}`);
    for (const w of r.warnings) console.error(`  warn: ${w}`);
  }
  console.log(
    JSON.stringify({ generated_at: new Date().toISOString(), window_days: args.days, sources: results }, null, 2),
  );

  if (args.strict && results.some((r) => r.errors.length > 0)) process.exit(1);
}

// Only run the CLI when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("render failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
