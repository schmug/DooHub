# Event source registry + two-phase discovery

**Date:** 2026-08-01
**Status:** Approved, ready for implementation

## Problem

Event discovery is entirely at the model's discretion. `prompts/weekly.md` step 3
says "from whatever sources you judge best" and names no venues. The result is a
store whose coverage drifts week to week: over half of `data/events.json` comes
from four aggregators, while major Triangle institutions produce one event or
none.

There are two failures underneath that.

**Named venues get missed.** Meymandi Concert Hall, Quail Ridge Books, Lenovo
Center, and Chapel of Bones have never appeared in the store. NC State, UNC, and
Duke collectively run dozens of public events a week and contribute two or three,
all from `nasher.duke.edu` and `gardens.duke.edu`.

**The source hints that do exist are duplicated and drifting.** The scheduled
routine's own prompt (`~/.claude/scheduled-tasks/weekly-triangle-events/SKILL.md`
step 4) carries an inline `e.g.` list of ~13 domains. That list lives outside the
repo, is not versioned with it, and contradicts the repo prompt's "sources you
judge best". The routine says the repo wins on conflict, so the inline list is
already the wrong place to add anything.

The obvious fix — paste a venue list into the prompt — creates a third problem.
A model handed an explicit list anchors on it, spends its budget there, and
treats the list as the search space. The long tail that makes this project useful
(pop-up markets, one-off festivals, town parks & rec, trivia nights) is exactly
what a venue registry structurally cannot hold, and exactly what gets crowded out.

## Scope

In scope:

- `data/sources.json` — a versioned, machine-readable seed registry, and the
  deletion of the routine's inline list in favor of a pointer to it.
- A two-phase discovery step in `prompts/weekly.md`: registry sweep, then
  open-ended discovery held to a countable off-registry quota.
- `data/source_coverage.json` — per-run telemetry on which seeds produced events
  and how much of the run came from outside the registry, surfaced in the PR body.
- Dedup fixes for the venue renames and sub-venue nesting the new seeds introduce:
  alias entries plus a `VENUE_PARENTS` relation consulted by `isSameOccurrence`.
- Registry validation in `npm run validate`, including a drift check that ties
  `sources.json` parent declarations to `dedup.ts`.

Out of scope (deliberate):

- Any change to the coverage radius. Wake Forest here means the **town** of Wake
  Forest, already inside the radius per `CLAUDE.md`. Wake Forest University is in
  Winston-Salem and stays out of scope.
- Per-source scraping adapters, RSS/iCal feed parsing, or any structured
  ingestion. Phase A uses the same WebFetch the run already uses.
- Ranking, scoring, or auto-pruning sources based on their hit history. The
  coverage report is read by a human; nothing acts on it automatically.
- Changing the event schema, the site, or `public/events.ics`.
- Backfilling past archives with events from the new seeds.

## Design

### 1. `data/sources.json`

A flat registry. Adding a venue later is a one-line data edit, not a prompt
rewrite.

```jsonc
{
  "schema_version": 1,
  "sources": [
    {
      "id": "meymandi-concert-hall",       // unique, kebab-case
      "name": "Meymandi Concert Hall",
      "kind": "venue",                     // "venue" | "hub" | "aggregator"
      "url": "https://www.martinmariettacenter.com/events",
      "city": "Raleigh",
      "parent_venue": "Martin Marietta Center for the Performing Arts",  // optional
      "venue_aliases": ["Meymandi", "Duke Energy Center for the Performing Arts"],
      "categories": ["concerts", "theater"],
      "notes": "NC Symphony's home; one of four halls in the complex"
    }
  ]
}
```

`kind` is descriptive, not behavioral — nothing branches on it. It exists so the
coverage report can group results, and so a human reading the file can tell a
single calendar from an institutional hub.

**Initial contents.** Three groups:

1. **The nine requested single venues and hubs** — NC Museum of Art, Meymandi
   Concert Hall, Quail Ridge Books, Lenovo Center, Red Hat Amphitheater, Chapel
   of Bones, NC State, UNC Chapel Hill, Duke, plus the town of Wake Forest.
2. **The ~13 domains currently inline in the routine** (triangleonthecheap,
   visitraleigh, dpacnc, boothamphitheatre, catscradle, carolinatheatre,
   goodnightscomedy, nasher.duke.edu, naturalsciences, lifeandscience,
   milb.com/durham, and the brewery/town calendars), so deleting the inline list
   loses nothing.
3. **Sub-venues for the three universities.** A hub entry alone underperforms — a
   central university calendar buries public events among academic ones. Each
   university gets its central calendar plus its separately-calendared public
   venues: Gregg Museum and Stewart Theatre for NC State; Ackland Art Museum,
   Memorial Hall / Carolina Performing Arts, and Morehead Planetarium for UNC;
   Nasher and Duke Gardens for Duke (both already present); plus the three
   athletics calendars.

That lands near 35 sources. **Every URL is verified to resolve during
implementation** — fetched, confirmed 2xx, and the actual calendar path recorded.
No URL is written from assumption.

### 2. Two-phase discovery in `prompts/weekly.md`

Step 3 splits in two. Phase B is unchanged in method; what is new is that it has
a floor it must clear and a stated reason it exists.

**Phase A — registry sweep.** Fetch every source in `data/sources.json`. Record
per-source hit counts for the coverage report. A source returning nothing is a
normal outcome (Lenovo Center in August is an empty arena) — log the zero, do not
manufacture an event to fill it.

**Phase B — open discovery.** Unchanged in method, with an explicit quota:

> At least **40%** of this run's events, and at least **8 distinct sources**, must
> come from outside `data/sources.json`. If Phase B falls short of either
> threshold, keep searching before writing outputs.

Phase B's prompt text names what the registry structurally cannot hold, so the
search has somewhere to go: pop-up and seasonal markets, one-off festivals and
street fairs, town parks & rec programming, trivia and karaoke nights, food-truck
rodeos, gallery openings, neighborhood and library events.

**Anti-anchoring clause**, stated flatly in the prompt:

> `data/sources.json` is a floor, not a search space. A seed returning nothing is
> never evidence an event doesn't exist. A satisfying Phase A count is never a
> reason to shorten Phase B.

The 40% / 8-source thresholds are a judgment call, not a measurement — current
data has no clean off-registry baseline to calibrate against, because the
registry doesn't exist yet. The first two runs' `source_coverage.json` will show
whether the number is loose enough to be meaningless or tight enough to cause
padding. Revisit it then; it is one number in one file.

The routine's `SKILL.md` step 4 inline domain list is replaced with a pointer:
"Discovery sources are seeded from `data/sources.json` — see `prompts/weekly.md`
Phase A/B. Do not maintain a source list here." This kills the drift between the
two prompts.

### 3. Dedup — renames and sub-venue nesting

The new seeds introduce three collision hazards the current `dedup.ts` gets wrong.
Because `computeId` hashes `normVenue`, a venue naming disagreement across sources
produces two different ids for one occurrence, and `isSameOccurrence` is the only
thing that can catch it.

**Renames.** Lenovo Center was PNC Arena until September 2024; the Martin Marietta
Center for the Performing Arts was the Duke Energy Center until 2023. Sources
still use both names for both buildings. New `VENUE_ALIASES` entries at
`scripts/lib/dedup.ts:17`:

| Variants | Canonical |
|---|---|
| `pnc arena`, `lenovo center` | `lenovo center` |
| `duke energy center for the performing arts`, `martin marietta center for the performing arts` | `martin marietta center for the performing arts` |
| `quail ridge books`, `quail ridge bookstore` | `quail ridge books` |

Chapel of Bones needs no alias — it has one name, and `normVenue`'s existing
lowercase/punctuation handling covers it.

**Sub-venue nesting.** Meymandi Concert Hall is one of four halls inside the
Martin Marietta Center; NC Symphony lists the hall, ticketing platforms list the
complex. An alias mapping Meymandi *into* the parent would be wrong — it would
merge a Meymandi concert with a Raleigh Memorial Auditorium show the same night.

Instead, a new map beside the aliases:

```ts
// Sub-venue -> the complex that contains it. Consulted only by
// isSameOccurrence's venue test, never by normVenue/computeId — collapsing a
// hall into its parent would merge distinct shows in different halls.
const VENUE_PARENTS: Record<string, string> = {
  "meymandi concert hall": "martin marietta center for the performing arts",
  "raleigh memorial auditorium": "martin marietta center for the performing arts",
  // ...
};
```

`isSameOccurrence`'s venue test (`dedup.ts:102`) gains a third disjunct: the
venues also match when one's canonical form is the other's registered parent.
This is safe because the existing ±90-minute and title-Jaccard-≥0.6 conditions
still have to hold — two genuinely different shows at one complex, starting
within 90 minutes of each other, with 60% title-token overlap, is not a real case.
Two halls in the same complex with *different* titles still stay separate, which
is the behavior the alias approach would have broken.

`normVenue` and `computeId` are untouched, so existing ids stay stable and no
archive is invalidated.

`dedup.ts` keeps its own hardcoded maps and stays pure and dependency-free —
it does not read `sources.json`. The two are tied together by validation instead
(§4), so they can't drift.

### 4. Validation and telemetry

**Registry validation**, added to `scripts/validate.ts` and run by
`npm run validate` (which `npm run build` and `run.sh` already gate on):

- Every `sources.json` entry has a unique `id`, a non-empty `name`, a `kind` in
  the allowed set, and a well-formed `url` (reusing the existing `URL_RE`).
- Every `parent_venue` string, run through `normVenue`, appears as a value in
  `dedup.ts`'s `VENUE_PARENTS`. This is the anti-drift check: adding a nested
  venue to the registry without teaching dedup about it fails the build.
- Registry URLs are HTTP-checked only under the existing `--check-links` flag,
  alongside event links. The default `validate` stays offline and fast.

**Coverage telemetry.** Each run writes `data/source_coverage.json`:

```jsonc
{
  "week": "2026-W32",
  "generated_at": "2026-08-06T11:14:00-04:00",
  "per_source": { "ncma": 5, "lenovo-center": 0, "quail-ridge-books": 3 },
  "zero_hit": ["lenovo-center", "red-hat-amphitheater"],
  "off_registry_sources": 11,
  "off_registry_events": 62,
  "total_events": 141
}
```

The routine's PR body gains a line: the zero-hit seed list and the off-registry
share. That is the whole feedback loop — a seed URL that starts 404ing shows up
as a persistent zero instead of failing silently for weeks, and a collapsing
off-registry share shows the registry crowding out discovery.

Nothing consumes `source_coverage.json` programmatically. It is committed with
the run so the history is inspectable, and it is not published to `public/`.

## Testing

TDD — every test below is written failing first.

**`scripts/dedup.test.ts`:**

- `normVenue("PNC Arena")` and `normVenue("Lenovo Center")` produce the same
  canonical, so `computeId` matches for the same show found under both names.
- Same for the Duke Energy Center / Martin Marietta Center pair.
- `isSameOccurrence` is **true** for the same concert listed at "Meymandi Concert
  Hall" and at "Martin Marietta Center for the Performing Arts", same start time,
  same title.
- `isSameOccurrence` is **false** for a Meymandi concert and a *different* show at
  Raleigh Memorial Auditorium the same night — the parent relation must not merge
  distinct halls with distinct titles. This is the regression the alias approach
  would have introduced.
- Parent matching still respects the time window: same venue pair, starts 3 hours
  apart → false.
- Existing ids are unchanged: a fixture event whose venue touches none of the new
  aliases hashes to the same id as before.

**`scripts/validate.test.ts`:**

- A registry with duplicate `id`s produces an ERROR.
- A malformed `url` produces an ERROR.
- A `parent_venue` with no `VENUE_PARENTS` entry produces an ERROR (the drift
  check).
- A valid registry produces no errors.

Full gate before PR: `npm test`, `npm run typecheck`, `npm run validate`,
`npm run build`.

## Acceptance criteria

1. `data/sources.json` exists with ~35 entries covering all ten requested
   locations (Wake Forest = the town), every URL verified to return 2xx.
2. `prompts/weekly.md` step 3 is a two-phase discovery step with the off-registry
   quota and the anti-anchoring clause.
3. The routine `SKILL.md` inline domain list is gone, replaced by a pointer.
4. `npm run validate` fails on a duplicate registry id, a malformed registry URL,
   and a `parent_venue` missing from `dedup.ts`.
5. The dedup tests above pass, including the Meymandi non-merge regression test.
6. `npm test`, `npm run typecheck`, and `npm run build` are green.
7. `CLAUDE.md` § Dedup documents `VENUE_PARENTS` and the new aliases, and the repo
   layout section lists `data/sources.json` and `data/source_coverage.json` — the
   doc and the behavior must not drift.

## Risks and open questions

- **Phase A run cost.** ~35 fetches per run, on top of Phase B. Weekly cadence
  makes this acceptable, but if the run starts timing out, the mitigation is
  tiering the registry (sweep every source monthly, a core subset weekly) rather
  than deleting seeds.
- **The 40% quota is unvalidated.** See §2. It is deliberately a single number in
  a single file, revisited after two runs of real coverage data.
- **A hub's central calendar may be unusable.** University calendars mix public
  events with academic ones and may not be filterable by fetch alone. If a central
  calendar proves noisy during implementation, that hub entry is dropped in favor
  of its sub-venues only, and the decision is recorded in the entry's `notes`.
- **`source_coverage.json` depends on the model self-reporting** which source each
  event came from. It is only as accurate as the `source` field already in the
  schema. It is a signal for a human, not an audit.
