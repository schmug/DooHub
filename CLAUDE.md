# Triangle Weekend Events Pipeline

A weekly, headless Claude Code job that discovers events in the Raleigh / Triangle
metro, deduplicates and enriches them, publishes an interactive page to Cloudflare
Pages, and emits a subscribable `.ics` calendar.

## Architecture (decided)

| Concern        | Decision                                                          |
|----------------|-------------------------------------------------------------------|
| Trigger        | Local `cron` invoking Claude Code headless (`claude -p`)          |
| Hosting        | Cloudflare Pages, served at a path under `cortech.online`         |
| Calendar       | Public static `events.ics` (subscribe-by-URL, no Google API)      |
| Data sources   | `data/sources.json` seed registry swept first, then open discovery |
| Radius         | Triangle metro only (Raleigh, Durham, Chapel Hill, Cary, + ring)  |
| Window         | Next 7 days from run date                                         |
| Persistence    | `data/events.json` committed to git (versioned history)           |
| Dedup          | Claude Code's design (see Dedup section for the bar to clear)     |

## Repo layout (target)

```
.
├── CLAUDE.md                  # this file
├── run.sh                     # cron entrypoint -> claude -p
├── prompts/
│   └── weekly.md              # the headless task prompt
├── data/
│   ├── events.json            # canonical store (deduped, enriched, versioned)
│   ├── sources.json           # seed discovery registry (Phase A floor)
│   ├── source_coverage.json   # per-run discovery telemetry
│   └── archive/YYYY-WW.json   # weekly snapshots
├── scripts/
│   ├── build_ics.{ts,py}      # events.json -> public/events.ics
│   └── validate.{ts,py}       # schema + link health checks
├── site/                      # Cloudflare Pages app (React)
│   └── ...
└── public/                    # Pages build output (incl. events.ics)
```

## Weekly run flow

1. `cron` fires `run.sh` (suggest Sat early AM so the page is fresh for the weekend).
2. `run.sh` calls `claude -p prompts/weekly.md` with required tools allowed
   (web search/fetch, file read/write, bash). Use `--dangerously-skip-permissions`
   only inside the sandboxed runner, never interactively.
3. Claude Code:
   - Computes the date window (today → +7 days) from the system clock. Never hardcode dates.
   - Discovers events across the categories below in two phases: Phase A sweeps
     every seed in `data/sources.json`, then Phase B searches openly for what a
     venue registry can't hold. The registry is a floor, not the search space —
     Phase B must supply ≥40% of the run's events from ≥8 off-registry domains
     (see `prompts/weekly.md` step 3).
   - Loads existing `data/events.json`, merges new finds, dedups, enriches.
   - Verifies each event (date in window, venue open, link resolves, price current).
   - Writes `data/events.json` + a `data/archive/<ISO-week>.json` snapshot.
   - Regenerates `public/events.ics` and rebuilds the React site.
4. Commit + push. Cloudflare Pages auto-deploys on push.

## Coverage

**Radius:** Triangle metro. Treat Raleigh as origin; include Durham, Chapel Hill,
Cary, Apex, Morrisville, Wake Forest, Hillsborough, Pittsboro. Drop anything that
isn't a reasonable same-day Triangle outing. Day trips only.

**Categories:** festivals, concerts, theater, markets, sports, galleries, museums,
tours, classes, breweries/tastings, trivia, parks, trails, historic sites,
shopping, family/kids, food events, comedy, nightlife. (Beaches/lakes are out of
metro scope unless inside the ring.)

**Time window:** events occurring within the next 7 days from run date.

## Event schema (per event in events.json)

```jsonc
{
  "id": "stable-hash",            // see Dedup
  "name": "string",
  "category": "string",           // one of the coverage categories
  "tags": ["string"],             // free-form: family-friendly, free, outdoor...
  "venue": "string",
  "address": "string",            // full street address
  "city": "string",
  "lat": 0.0, "lon": 0.0,         // for GEO + map; geocode best-effort
  "start": "ISO-8601",            // with tz offset (America/New_York)
  "end": "ISO-8601",
  "duration_min": 0,
  "price": "string",              // human: "Free", "$15", "$10-$25"
  "budget": "$|$$|$$$|$$$$",
  "indoor_outdoor": "indoor|outdoor|both",
  "vegan": "yes|no|unknown",
  "vegetarian": "yes|no|unknown",
  "weather": { "summary": "string", "temp_f": 0 },  // forecast if outdoor + in range
  "image_url": "string",          // working image; validate it loads
  "booking_url": "string",
  "info_url": "string",
  "source": "string",             // where it was found
  "first_seen": "ISO-8601",
  "last_verified": "ISO-8601"
}
```

Fields that can't be verified → `"unknown"` rather than guessed. Never invent
prices, addresses, or links.

## Dedup (design it, but clear this bar)

The same event recurs across weeks and appears on multiple sources with varied
titles. Your dedup must:

- Assign each event a **stable `id`** so it survives across weekly runs (so we don't
  re-add the same thing, and so history/`first_seen` is meaningful). A normalized
  hash of (lowercased name tokens + date + venue) is a reasonable start.
- Collapse cross-source duplicates of the *same* occurrence (same thing, same
  start, same venue, different listing) into one record, preferring the source with
  the best booking link + image.
- Keep distinct *occurrences* of a recurring series separate (a weekly trivia night
  is 7 different events across a month, not one).
- Be resilient to fuzzy title variation ("NCMA: Art in the Evening" vs
  "Art in the Evening @ NC Museum of Art").

Document your final dedup rules in a `## Dedup` section you append to this file.

## Verification checklist (per run)

- [ ] Each event's start is within today → +7 days
- [ ] Venue is operating on the event date
- [ ] `booking_url` / `info_url` return 2xx (run `scripts/validate`)
- [ ] `image_url` loads
- [ ] Price reflects current listing
- [ ] Outdoor events have a current forecast
- [ ] Distance/time is a sane Triangle same-day trip
- [ ] No duplicate `id`s in events.json

## Output #1 — Interactive site (React, Cloudflare Pages)

Single React app. Mobile-responsive, clean modern design.

**Views:** Chronological (grouped by day) · By city · By category · Table · Map.
**Filters:** day · time of day (morning/afternoon/evening) · distance band ·
price (Free/$/$$/$$$/$$$$) · indoor/outdoor · vegan/veg · category · text search.
**Sort:** date/time · distance · price · city · category.

**Event card:**
```
EVENT NAME 🎵
City, NC · 22 min (14 mi) 📍
Sat, 2–5 PM 🕐
$15 ($$) · Sunny 72°F ☀️
Outdoor 🌳 · Vegan options 🌱
[Book] [Add to Calendar] [Info]
Short description…
```
Icons: 🌱 vegan · 🥗 vegetarian · 🏠 indoor · 🌳 outdoor. Color-code budgets.
Distance badges. Every booking/info link clickable. Images must render.

**Export:** "All events" `.ics` and "filtered events" `.ics` (client-side build
from current filter state).

## Output #2 — Curated itineraries

Generate 5–8 pre-planned same-day Triangle outings from the week's events.

Each itinerary: overview (anchor city, drive time, weather, theme, cost range) ·
morning/afternoon/evening schedule with timing + locations + prices · food
(breakfast/lunch/dinner with specific vegan/veg dishes) · good-weather vs rain
alternatives for outdoor legs · practical notes (routes, parking, booking links,
suggested departure time) · per-itinerary `.ics` export.

Surface both outputs behind tabs: **Browse All Events** / **View Itineraries**.

## events.ics requirements

Static file at `public/events.ics`, regenerated each run. Per VEVENT:
`SUMMARY`, `DTSTART`, `DTEND`, `LOCATION` (full address), `DESCRIPTION`
(price, vegan/veg, booking link), `URL`, `GEO`, and a stable `UID` = event `id`
(so calendar subscribers see updates, not dupes). Use `America/New_York`.
Subscribe URL will be `https://<your-pages-domain>/events.ics`.

## Guardrails

- Compute dates from the clock every run; never hardcode "this weekend".
- Don't fabricate events, prices, links, or images — unverifiable → `unknown` / omit.
- Idempotent: re-running the same week must not create duplicates.
- Keep secrets out of git; if any source needs a key, read it from env.
- Commit a short run summary (counts: new / updated / dropped) in the commit body.

## run.sh (sketch)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
claude -p "$(cat prompts/weekly.md)" \
  --allowedTools "WebSearch,WebFetch,Read,Write,Edit,Bash" \
  --dangerously-skip-permissions
git add -A
git commit -m "weekly events: $(date +%F)" || echo "no changes"
git push
```

## crontab (sketch)

```
# Saturday 05:30 local
30 5 * * 6  /path/to/repo/run.sh >> /path/to/repo/run.log 2>&1
```

## Dedup

Final dedup design (the bar in "Dedup (design it…)" above). It is mirrored in
`prompts/weekly.md` and implemented as pure, tested helpers in
`scripts/lib/dedup.ts` (`computeId`, `normName`, `normVenue`, `isSameOccurrence`)
so the doc and the behavior can't silently drift.

### 1. Stable `id` (survives weekly runs, separates occurrences)

```
id = sha1( normName + "|" + localDate + "|" + normVenue ).slice(0, 12)
```

- **`normName`** — lowercase → strip punctuation/symbols → split on whitespace →
  drop filler tokens (`the, a, an, of, at, in, on, for, to, @, &, and, presents,
  present, featuring, feat, ft, with, live, nc, north carolina, raleigh, durham,
  cary, chapel, hill, series, event`) → de-duplicate → **sort** → join with single
  spaces. Sorting + set semantics make the hash insensitive to token *order* and
  filler, so re-listings of the same occurrence with reordered words land on one
  id. Note: this alone does **not** collapse every messy cross-source title —
  `"NCMA: Art in the Evening"` (→ `art evening ncma`) and
  `"Art in the Evening @ NC Museum of Art"` (→ `art evening museum`) still hash
  differently because one embeds the acronym and the other the spelled-out venue.
  Those are caught at the **merge step (§2 `isSameOccurrence`)**, which anchors on
  venue + time and then assigns the surviving record's id. computeId's job is a
  *stable* id for a given listing across runs; §2's job is *fuzzy* cross-source
  collapse.
- **`localDate`** — the **start date** (not time) in `America/New_York`,
  `YYYY-MM-DD`. Using the date (not the timestamp) absorbs cross-source time
  disagreements (7:00 vs 7:30 listings). Using the date (not just venue+name)
  keeps **each occurrence of a recurring series distinct** — a weekly trivia
  night is 7 different ids across a month, exactly as required.
- **`normVenue`** — lowercase → trim → strip a leading `the ` → collapse
  whitespace → apply the **alias map** (canonical venue names) below.

Because the inputs are fully determined by the event itself, the id is **stable
across runs**: re-discovering the same occurrence recomputes the same id, so it
updates in place instead of being re-added, and `first_seen` stays meaningful.

**Venue alias map** (extend as new venues recur). Maps known variants →
canonical form so the same place hashes identically:

| Variants                                                   | Canonical            |
|------------------------------------------------------------|----------------------|
| `ncma`, `north carolina museum of art`, `nc art museum`    | `nc museum of art`   |
| `dpac`, `durham performing arts center`                    | `dpac`               |
| `red hat amphitheater`, `red hat amp`                      | `red hat amphitheater` |
| `koka booth`, `koka booth amphitheatre`                    | `koka booth amphitheatre` |
| `the carolina theatre`, `carolina theatre of durham`       | `carolina theatre`   |
| `cam raleigh`, `contemporary art museum raleigh`           | `cam raleigh`        |
| `quail ridge books`, `quail ridge bookstore`               | `quail ridge books`  |
| `meymandi`, `meymandi concert hall`                        | `meymandi concert hall` |

**Renamed venues.** Two Triangle venues were renamed recently and sources still
use their old names: PNC Arena (and, older still, RBC Center) → **Lenovo Center**
(naming rights expired 2024-08-31) and Duke Energy Center for the Performing Arts
→ **Martin Marietta Center for the Performing Arts** (2023). Every variant is in
the alias map, so one show listed under any of them hashes to a single id. Note
that `meymandi` (the standard local shorthand) canonicalizes to the **hall**, not
to the complex — see sub-venues below.

**Sub-venues (`VENUE_PARENTS`).** Some venues are halls inside a larger complex —
Meymandi Concert Hall, Raleigh Memorial Auditorium, A.J. Fletcher Opera Theater,
and Kennedy Theatre all sit inside the Martin Marietta Center. Sources disagree
about which to name. These are **not** in the alias map: collapsing a hall into
its complex would merge distinct shows playing different halls the same night.
Instead `scripts/lib/dedup.ts` carries a `VENUE_PARENTS` map consulted only by
`isSameOccurrence` — the venue test also passes when one record names a hall and
the other names its complex. The ±90-minute and title-Jaccard-≥0.6 conditions
still apply, so sibling halls with different shows stay separate. `normVenue` and
`computeId` never consult it, so hall-level ids stay stable.

`npm run validate` fails if `data/sources.json` declares a `parent_venue` that
`VENUE_PARENTS` doesn't know, or a `venue_aliases` entry that `normVenue` doesn't
canonicalize onto that source's own venue, so the registry and the dedup rules
can't drift.

### 2. Collapse cross-source duplicates of the *same* occurrence

Two records describe the same occurrence — even if their computed ids differ
because of messy titles/venues — when **all three** hold:

1. **Venue match** — `normVenue` equal, OR token-set Jaccard ≥ 0.6 on the venue
   tokens (handles "Lincoln Theatre" vs "The Lincoln Theatre Raleigh"), OR one
   venue is the other's registered parent complex (`VENUE_PARENTS`, above).
2. **Time proximity** — `start` within **±90 minutes**.
3. **Title match** — title token-set Jaccard ≥ **0.6**, OR one title's token set
   is a subset of the other's (handles "Art in the Evening" ⊆ "NCMA: Art in the
   Evening — Jazz Night").

When matched, **keep a single record** and pick the canonical id from the winner:

- **Winner = best listing:** prefer a record with a real (`!= "unknown"`)
  `booking_url`, then one with a loading `image_url`, then the one from the more
  authoritative `source` (official venue > aggregator). Ties → keep the existing
  stored record over a new find.
- **Merge fields:** union `tags`; take the **earliest** `first_seen` and the
  **latest** `last_verified`; fill any `"unknown"` field on the winner from the
  loser if the loser has a verified value; keep the winner's `name`, links, and
  image.

### 3. Run order (idempotency)

On each run: start from the in-window survivors of the existing store (they own
`first_seen`), then fold in new finds one by one. For each new find: compute its
id; if that id exists → treat as the same occurrence and merge (§2 preference
rules). If not, run the §2 fuzzy check against current records to catch
near-duplicates with a different id; merge if matched, else insert as new.
Re-running the same week is a no-op on the event set.

### 4. Edge cases

- **Multi-day festivals** listed once but spanning days: keep as **one** record
  with `start`/`end` across the span (don't explode into per-day occurrences)
  unless the source sells distinct per-day sessions, in which case each session
  is its own occurrence (distinct `localDate` → distinct id).
- **Same name, same night, different venues** (e.g. a touring trivia brand at two
  bars) stay distinct — `normVenue` differs, so ids differ. Correct.
- **Venue renamed/missing**: if venue is `"unknown"`, fall back to `normVenue =
  city` for the id so the event still gets a stable-ish id; flag for manual
  review.

