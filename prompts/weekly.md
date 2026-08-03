# Weekly task — Triangle Weekend Events

You are the weekly headless run for the **Triangle Weekend Events Pipeline**. Your
job is to refresh `data/events.json` with verified events happening in the
Triangle metro over the next 7 days, regenerate the calendar + site, and commit.

`CLAUDE.md` in the repo root is the authoritative spec. The four sections below
(**Coverage**, **Event schema**, **Verification checklist**, **Dedup**) are
mirrored from it so this prompt is self-contained. **If you change one, change
both in the same commit** — CLAUDE.md wins on any conflict.

---

## What to do this run

1. **Compute the date window from the system clock.** Today → today + 7 days.
   Never hardcode dates. Use `America/New_York`. Get today's date with `date`.
2. **Load the existing store.** Read `data/events.json`. Keep events still in the
   window; they already have stable `id`s and `first_seen` — preserve those.
3. **Discover** events across every category in **Coverage** below, in two phases.

   **Phase A — registry sweep (the floor).** Read `data/sources.json` and check
   every source in it. Record how many events each source contributed, by `id`,
   for the coverage report in step 7. A source that yields nothing this week is a
   normal outcome — an arena in the offseason, a seasonal amphitheater in
   January. Log the zero and move on; never manufacture an event to fill a gap.
   Sources marked `"fetch_blocked": true` return 403 to a plain fetch — use
   WebFetch, and fall back to a site-scoped WebSearch if that also fails.

   **Phase B — open discovery (required, not leftover).** Search beyond the
   registry, exactly as before: official venue sites, city and tourism calendars,
   ticket platforms, brewery and market pages, university arts calendars,
   neighborhood and library listings. Lean into what a venue registry
   structurally cannot hold — pop-up and seasonal markets, one-off festivals and
   street fairs, town parks & rec programming, trivia and karaoke nights,
   food-truck rodeos, gallery openings.

   **Phase B has a floor you must clear:** at least **40% of this run's events**
   and at least **8 distinct sources** must come from outside `data/sources.json`.
   Both are counted against the store you write in step 7 — *this run's events*
   means every event in the final `data/events.json`, carried-forward ones
   included, and *distinct sources* means distinct registrable domains, not
   distinct `source` strings. If you are short of either when you think you're
   done, keep searching.

   `data/sources.json` is a floor, not a search space. A seed returning nothing
   is never evidence an event doesn't exist. A satisfying Phase A count is never
   a reason to shorten Phase B.

   Prefer primary sources for accurate times, prices, and booking links.
4. **Dedup + merge** new finds into the store with the tested helpers in
   `scripts/lib/dedup.ts`, per the **Dedup** rules below. Re-running the same
   week must not create duplicates (idempotent).
5. **Enrich** each event to the **Event schema**. Geocode best-effort for
   `lat`/`lon`. Add a current forecast for outdoor events in range. Add a short
   `description` (1–2 sentences) for the card. Unverifiable fields → `"unknown"`,
   never guessed. Never invent prices, addresses, links, or images.
6. **Verify** every event against the **Verification checklist**. Drop events that
   fail (out of window, venue closed, dead links). Update `last_verified`.
7. **Write outputs:**
   - `data/events.json` — the merged, deduped, enriched store. Update the
     envelope's `generated_at` (ISO now) and `week` (ISO week, e.g. `2026-W25`).
   - `data/archive/<ISO-week>.json` — a snapshot copy of this run's store.
   - `data/itineraries.json` — 5–8 curated same-day itineraries (Output #2 in
     CLAUDE.md): overview, morning/afternoon/evening schedule, food with specific
     vegan/veg dishes, good-weather vs rain alternatives, practical notes, and the
     `event_ids` each itinerary includes.
   - `data/source_coverage.json` — this run's discovery telemetry:
     `{ week, generated_at, per_source: { "<source id>": <count> }, zero_hit: [<ids with 0>],
     off_registry_sources, off_registry_events, total_events }`. Units, so
     week-over-week numbers are comparable: `total_events` is the event count in
     the `data/events.json` you just wrote (carried-forward events included),
     `off_registry_sources` counts **distinct registrable domains** outside the
     registry (not distinct `source` strings), and
     `sum(per_source) + off_registry_events` must equal `total_events`. Give every
     registry `id` a `per_source` entry, `0` included — and **only** registry ids:
     every `per_source` key must be an `id` from `data/sources.json`. Off-registry
     finds are counted in `off_registry_events` / `off_registry_sources`, never as
     `per_source` keys. `npm run validate` errors if a `per_source` key isn't a
     known id, if `week` doesn't match the store, or if the counts don't add up,
     and warns on a missing seed, an off-registry share under 40%, or fewer than 8
     off-registry sources.
8. **Validate + build (deterministic):**
   ```bash
   npm run validate            # fix every ERROR before continuing
   npm run validate:links      # optional: HTTP-check booking/info/image urls
   npm run build               # validate -> vite build -> copy json -> build ics
   ```
   `npm run build` also runs `validate` and writes `public/events.ics` +
   `public/events.json` + `public/itineraries.json`. (`run.sh` re-runs these as a
   backstop, so it's safe if you skip the manual build, but prefer to run it so
   you can see failures.)
9. **Write the run summary, don't commit.** Write one line to
   `data/last_run_summary.txt` with the counts, e.g.
   `N new / M updated / K dropped`. `run.sh` is the sole committer + pusher (it
   reads that file for the commit body, then deploys via Cloudflare Pages). If
   you're running by hand without `run.sh`, you may commit yourself using a
   `chore(events):` prefix — but never push to a protected branch; follow the
   repo's PR rules.

Keep secrets out of git. If a source needs an API key, read it from the
environment — never hardcode or commit it.

---

## Coverage

**Radius:** Triangle metro. Treat Raleigh as origin; include Durham, Chapel Hill,
Cary, Apex, Morrisville, Wake Forest, Hillsborough, Pittsboro. Drop anything that
isn't a reasonable same-day Triangle outing. Day trips only.

**Categories:** festivals, concerts, theater, markets, sports, galleries, museums,
tours, classes, breweries/tastings, trivia, parks, trails, historic sites,
shopping, family/kids, food events, comedy, nightlife. (Beaches/lakes are out of
metro scope unless inside the ring.)

**Time window:** events occurring within the next 7 days from run date.

---

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
  "lat": 0.0, "lon": 0.0,         // for GEO + map; geocode best-effort (null if unknown)
  "start": "ISO-8601",            // with tz offset (America/New_York)
  "end": "ISO-8601",
  "duration_min": 0,
  "price": "string",              // human: "Free", "$15", "$10-$25"
  "budget": "$|$$|$$$|$$$$",      // or "unknown"
  "indoor_outdoor": "indoor|outdoor|both",
  "vegan": "yes|no|unknown",
  "vegetarian": "yes|no|unknown",
  "weather": { "summary": "string", "temp_f": 0 },  // forecast if outdoor + in range, else null
  "image_url": "string",          // working image; validate it loads
  "booking_url": "string",
  "info_url": "string",
  "source": "string",             // where it was found
  "first_seen": "ISO-8601",
  "last_verified": "ISO-8601",
  "description": "string"         // short blurb for the card + ics DESCRIPTION (optional)
}
```

Fields that can't be verified → `"unknown"` rather than guessed. Never invent
prices, addresses, or links. The whole store is wrapped in an envelope:
`{ "schema_version", "generated_at", "week", "origin", "events": [ ... ] }`.

---

## Verification checklist (per run)

- [ ] Each event's start is within today → +7 days
- [ ] Venue is operating on the event date
- [ ] `booking_url` / `info_url` return 2xx (`npm run validate:links`)
- [ ] `image_url` loads
- [ ] Price reflects current listing
- [ ] Outdoor events have a current forecast
- [ ] Distance/time is a sane Triangle same-day trip
- [ ] No duplicate `id`s in events.json (`npm run validate`)

---

## Dedup

(Mirrors `CLAUDE.md` § Dedup — the full algorithm and rationale live there.)

**Use the tested helpers, don't reimplement this.** `scripts/lib/dedup.ts` is the
executable form of these rules — `computeId`, `normName`, `normVenue`,
`venueParent`, `isSameOccurrence`. Import them (or call them via `tsx`) rather
than re-deriving the logic from the prose below; the prose is a condensed mirror
and will not reproduce the alias and parent-venue tables exactly.

**Stable id.** `id = sha1( normName + "|" + localDate + "|" + normVenue )[:12]`,
where:
- `normName` = lowercase → strip punctuation → drop filler tokens (`the`, `a`,
  `an`, `at`, `@`, `presents`, `feat`, `featuring`, `with`, `live`, `nc`,
  `raleigh`, `durham`) → sort the remaining unique tokens → join with spaces.
- `localDate` = the event's **start date** in `America/New_York` (`YYYY-MM-DD`),
  **not** the time — absorbs minor cross-source time differences.
- `normVenue` = lowercase venue with leading `the ` removed and known aliases
  canonicalized (e.g. `NCMA` / `North Carolina Museum of Art` → `nc museum of art`).
  The alias table also absorbs two renames sources still use both names for:
  `PNC Arena` / `RBC Center` → `lenovo center`, and `Duke Energy Center for the
  Performing Arts` → `martin marietta center for the performing arts`.

Date is in the key, so **each occurrence of a recurring series gets its own id**
(weekly trivia = 7 distinct events across a month). The id is **stable across
weekly runs**, so re-discovering the same occurrence updates it in place instead
of adding a dupe, and `first_seen` stays meaningful.

**Collapsing cross-source duplicates.** Two records are the same occurrence when
all hold: same `normVenue` (or fuzzy match), `start` within **±90 minutes**, and
title token-set Jaccard ≥ **0.6** (or one title's token set ⊆ the other's). On a
match, keep **one** record: prefer the source with a real `booking_url` **and** a
loading `image_url`; union `tags`; keep the earliest `first_seen` and latest
`last_verified`.

The venue test also passes when one record names a hall and the other names the
complex containing it (`venueParent` — e.g. Meymandi Concert Hall vs Martin
Marietta Center for the Performing Arts), so one concert listed both ways merges.
Sibling halls stay separate: the ±90-minute and title conditions still apply, and
ids are never collapsed into the parent.

**Merge order on a run:** existing-store events first (they own `first_seen`),
then fold in new finds. Identical computed `id` → same occurrence → merge.
