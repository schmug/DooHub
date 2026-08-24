# Triangle Weekend Events

A weekly, headless [Claude Code](https://claude.com/claude-code) job that discovers
events across the Raleigh / Triangle metro, deduplicates and enriches them,
publishes an interactive site to **Cloudflare Pages**, and emits a subscribable
**`events.ics`** calendar.

> **Spec:** [`CLAUDE.md`](./CLAUDE.md) is the authoritative design (architecture,
> coverage, event schema, verification, dedup). This README is setup + operations.

---

## What's in here

```
.
├── CLAUDE.md                 # authoritative spec (incl. the Dedup design)
├── run.sh                    # cron entrypoint: claude -p → validate → build → PR
├── crontab.txt               # cron snippet (not auto-installed)
├── prompts/weekly.md         # the headless task prompt (mirrors CLAUDE.md sections)
├── data/
│   ├── events.json           # canonical store (envelope + events[]) — starts empty
│   ├── itineraries.json      # curated outings — starts empty
│   ├── sources.json          # seed discovery registry (the Phase A floor)
│   ├── source_coverage.json  # per-run discovery telemetry (written each run)
│   └── archive/              # weekly <ISO-week>.json snapshots
├── scripts/
│   ├── build_ics.ts          # data/events.json → public/events.ics (RFC 5545)
│   ├── validate.ts           # events + registry + coverage checks (+ --check-links)
│   ├── publish_data.ts       # copy data/*.json → public/ for the site to fetch
│   ├── lib/{ics,dedup,types}.ts
│   └── *.test.ts             # node --test unit tests
├── site/                     # Vite + React + TS app (built into ../public)
└── public/                   # Pages build output (gitignored; regenerated each run)
```

> **Note on `data/itineraries.json`:** the original target layout only named
> `events.json`. Output #2 (curated itineraries) needs its own store, so this repo
> adds `data/itineraries.json` with the same envelope convention.

> **Note on the discovery files:** `data/sources.json` is the seed registry each
> run sweeps first — a floor for discovery, not its search space — and
> `data/source_coverage.json` is the telemetry that run writes back (per-seed hits,
> zero-hit seeds, off-registry share). The coverage file isn't in the repo until a
> run produces one; `validate` skips it when absent and checks it when present.
> The two-phase rules live in [`CLAUDE.md`](./CLAUDE.md) § Weekly run flow and
> `prompts/weekly.md` step 3 — read those rather than a copy here.

---

## Prerequisites

- **Node ≥ 20** (developed on Node 22). `node --version`.
- **Claude Code CLI** authenticated for headless runs (see below).
- A **Cloudflare account** (for Pages) and a **git remote** (Pages deploys on push).

---

## 1. Install + run locally

Two npm projects: the root (pipeline scripts) and `site/` (the React app).

```bash
# from the repo root
npm install            # script deps: tsx, typescript
npm test               # 65 unit tests (ics + validate + dedup)
npm run validate       # checks data/events.json + data/sources.json (empty store → 0 errors)

# the site
npm --prefix site install
npm --prefix site run dev      # http://localhost:5173  (renders SAMPLE data)
```

With no real data yet, the site falls back to bundled sample events/itineraries
(`site/src/data/sample*.ts`) so you can see every view, filter, and the itinerary
tab render. A banner notes "Showing sample data".

### Build everything (what the pipeline does)

```bash
npm run build
# = validate  →  vite build (→ ../public)  →  copy events.json/itineraries.json
#                →  build_ics (→ public/events.ics)
```

Open `public/index.html` via a static server (don't `file://` it — the app fetches
`/events.json`):

```bash
npx serve public      # or: python3 -m http.server -d public 8080
```

---

## 2. Authenticate Claude Code for headless runs

`run.sh` calls `claude -p` non-interactively. Authenticate once on the machine
that will run cron:

```bash
claude          # sign in interactively once (OAuth or API key), then quit
claude -p "say hi" --dangerously-skip-permissions   # smoke-test headless mode
```

- For an unattended runner, set `ANTHROPIC_API_KEY` in the environment instead of
  interactive login, or ensure the stored OAuth token is present for the cron user.
- `--dangerously-skip-permissions` is only used inside `run.sh` (a sandboxed,
  non-interactive context). Never use it in an interactive session.
- Keep keys out of git. `.env`, `.env.*`, and `.dev.vars` are gitignored.

---

## 3. Create the Cloudflare Pages project

> ⚠️ This is an account action. **Do it yourself** — the scaffolding step does not
> touch your Cloudflare account.

**Option A — connect to git (recommended; auto-deploys on push):**

1. Push this repo to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick the repo, then set:
   - **Framework preset:** None / Vite
   - **Build command:** `npm install && npm --prefix site install && npm run build`
   - **Build output directory:** `public`
   - **Root directory:** repo root (leave default)
   - **Node version:** set env var `NODE_VERSION=20` (or newer)
4. Deploy. Every push to the production branch redeploys.

**Option B — direct upload from the runner (no git build on Cloudflare):**

```bash
npm run build
npx wrangler pages deploy public --project-name=triangle-weekend
```

### Domain / path under `cortech.online`

The spec serves the site "at a path under `cortech.online`". Two ways:

- **Subdomain (simplest):** add a **custom domain** like
  `triangle.cortech.online` to the Pages project (Pages → your project → Custom
  domains). Keep `site/vite.config.ts` `base: "/"`. The calendar lives at
  `https://triangle.cortech.online/events.ics`.
- **Sub-path** (`cortech.online/triangle/`): set `base: "/triangle/"` in
  `site/vite.config.ts`, rebuild, and route that path to this Pages project
  (e.g. via a Cloudflare Worker / Pages path on the apex). Subdomain is less
  fiddly; prefer it unless you specifically need the apex path.

Update the **subscribe URL** wherever you share it to match the final domain.

---

## 4. First manual run

Once Claude Code is authed and (optionally) the Pages project exists:

```bash
# Dry, deterministic pieces first (no model, no network writes):
npm run validate && npm run build

# Full weekly run (two-phase discovery, writes data/*.json, builds, opens a PR):
./run.sh
```

`run.sh` will: sync `main` → run the headless prompt → `npm run validate` (aborts
on errors) → `npm run build` → commit `chore(events): weekly refresh <date>` to a
per-run `events/weekly-<date>-<epoch>` branch → open a PR → arm auto-merge. The PR
lands itself once CI is green, and Cloudflare Pages deploys on the resulting push.

The headless prompt discovers in two phases — Phase A sweeps every seed in
`data/sources.json`, then Phase B searches beyond the registry for what a venue
list structurally can't hold — and writes `data/source_coverage.json` alongside
the store. `prompts/weekly.md` step 3 has the phase rules and the off-registry
floor Phase B has to clear.

A seed that publishes a machine-readable calendar declares it as an `ingest`
block, and Phase A reads that instead of scraping the page — `scripts/lib/feeds.ts`
parses ICS and Localist JSON into draft events, applying the Triangle radius
filter and `computeId`. RSS/Atom is deliberately unsupported: every Triangle
venue advertising a `<link rel="alternate">` feed serves its WordPress *blog*,
so wiring one in would file job postings as events.

> **Heads up — the weekly refresh is gated, not pushed.** `main` carries a ruleset
> requiring the `pipeline` and `site` checks from `.github/workflows/ci.yml`, so a
> direct push is rejected. `run.sh` opens a PR and arms auto-merge instead: a green
> run lands unattended, and a red one leaves the PR open rather than deploying bad
> data. Nothing merges on red. If CI breaks, the weekly refresh stops landing until
> it's fixed — check open `events/weekly-*` PRs if the site looks stale.

---

## 5. Schedule it (cron)

Not installed automatically. See [`crontab.txt`](./crontab.txt):

```bash
crontab -e
# paste (edit the path):
# 30 5 * * 6  /Users/cory/DooHub/run.sh >> /Users/cory/DooHub/run.log 2>&1
crontab -l      # verify
```

Saturday 05:30 local keeps the page fresh for the weekend. On macOS you may need
to grant your terminal / cron **Full Disk Access** for file writes, and confirm
`claude`/`node`/`git` resolve on cron's thin PATH (run.sh prepends the common bins).

---

## Calendar subscription

After the first deploy, subscribe to:

```
https://<your-pages-domain>/events.ics
```

Apple Calendar / Google Calendar / Outlook can subscribe by URL. UIDs are stable
(`<event-id>@triangle-weekend.cortech.online`), so subscribers see updates rather
than duplicates across weeks. The site also offers client-side **"All events"**,
**"Filtered events"**, per-event, and per-itinerary `.ics` downloads.

---

## Operations / troubleshooting

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the ics builder, validator, dedup helpers, and feed parsers |
| `npm run validate` | Schema/enum/window/dup-id checks on `data/events.json`; also `data/sources.json` (kebab-case ids, URL shape, `parent_venue` / `venue_aliases` anti-drift against `dedup.ts`, `ingest` feed declarations) and `data/source_coverage.json` when present |
| `npm run validate:links` | Above **plus** HTTP 2xx checks on booking/info/image URLs, every registry source URL (`fetch_blocked` sources skipped), and every declared `ingest.feed_url` |
| `npm run build:ics` | Regenerate `public/events.ics` only |
| `npm run build` | Full deterministic build (validate → site → data → ics) |
| `npm run typecheck` | Type-check the scripts (`site` has its own `npm --prefix site run typecheck`) |

- **Empty store:** `data/events.json` ships empty (`{ "events": [] }`). The site
  shows sample data until the first real run publishes a non-empty store.
- **Empty registry:** `data/sources.json` seeds Phase A (48 sources today). An
  empty one validates with a warning, not an error — discovery still runs, it just
  has no floor. A missing `data/source_coverage.json` is fine before the first run
  under the current prompt; a malformed one is an error.
- **Dedup:** see `CLAUDE.md` § Dedup; the executable helpers live in
  `scripts/lib/dedup.ts` (`computeId`, `isSameOccurrence`).
- **Never commit secrets.** `.env*` and `.dev.vars` are gitignored; read any
  source API keys from the environment.
