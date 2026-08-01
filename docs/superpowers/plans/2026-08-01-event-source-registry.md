# Event Source Registry + Two-Phase Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed the weekly event discovery run with a versioned 48-source venue registry that raises the coverage floor without letting the model treat the list as its search space.

**Architecture:** A new `data/sources.json` registry holds the seed sources. `prompts/weekly.md` splits discovery into Phase A (sweep the registry) and Phase B (open-ended search, held to a countable off-registry quota). Each run writes `data/source_coverage.json` telemetry. `scripts/lib/dedup.ts` gains venue-rename aliases and a sub-venue parent relation so the new seeds don't produce cross-source duplicates, and `scripts/validate.ts` gains registry validation including a drift check that ties the registry to dedup.

**Tech Stack:** TypeScript run through `tsx`, `node:test` + `node:assert/strict` for tests, no new dependencies.

## Global Constraints

- **No new npm dependencies.** Everything uses the existing `tsx` + `node:test` toolchain.
- **`scripts/lib/dedup.ts` stays pure and I/O-free.** It must not read `data/sources.json`. The registry and dedup are tied together by a validation drift check, not by an import.
- **`normVenue` and `computeId` behavior must not change for any venue not named in the new alias table.** Existing event `id`s are stable across weekly runs and are the `UID`s in published `.ics` files; changing them silently breaks calendar subscribers.
- **Conventional Commit prefixes** on every commit (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- **Never push to `main`.** Work on the current branch `claude/event-search-locations-1c8ed1` and open a PR.
- **Wake Forest means the town of Wake Forest, NC** (inside the coverage radius). Wake Forest University is in Winston-Salem and is out of scope.
- **Test command:** `npm test` runs `node --import tsx --test scripts/*.test.ts`. Single file: `node --import tsx --test scripts/dedup.test.ts`.
- **Full gate before PR:** `npm test && npm run typecheck && npm run validate && npm run build`.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `scripts/lib/dedup.ts` | Modify | Add `VENUE_ALIASES` rename entries; add `VENUE_PARENTS` map + exported `venueParent()`; extend `isSameOccurrence`'s venue test |
| `scripts/dedup.test.ts` | Modify | Rename-collapse tests, parent-match tests, and the Meymandi/Memorial non-merge regression test |
| `scripts/lib/types.ts` | Modify | `EventSource`, `SourcesRegistry`, `SourceCoverage` interfaces + `SOURCE_KINDS` |
| `data/sources.json` | Create | The 48-entry seed registry |
| `scripts/validate.ts` | Modify | `validateSources()` + `validateCoverage()` pure validators; wire both into `main()`; registry link health under `--check-links` |
| `scripts/validate.test.ts` | Modify | Registry + coverage validator tests |
| `prompts/weekly.md` | Modify | Phase A / Phase B discovery step; coverage-report output step |
| `CLAUDE.md` | Modify | Document `VENUE_PARENTS`, new aliases, registry files in repo layout |
| `~/.claude/scheduled-tasks/weekly-triangle-events/SKILL.md` | Modify | Delete the inline domain list; point at the registry; add the coverage line to the PR body |

Tasks 1 and 2 both touch `dedup.ts` and must run in order. Tasks 3–5 depend on Task 2's `venueParent()` export only in Task 3's drift check. Task 6 is documentation and prompts, and depends on the filenames established in Tasks 3 and 5.

---

### Task 1: Venue rename aliases

Lenovo Center was PNC Arena until September 2024, and the Martin Marietta Center for the Performing Arts was the Duke Energy Center until 2023. Sources still use both names for both buildings, so the same show hashes to two different `id`s.

**Files:**
- Modify: `scripts/lib/dedup.ts:17-27` (the `VENUE_ALIASES` map)
- Test: `scripts/dedup.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exports. `normVenue(venue: string): string` and `computeId(ev): string` keep their existing signatures; only their output for the newly aliased venues changes.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/dedup.test.ts`:

```ts
test("normVenue collapses the PNC Arena -> Lenovo Center rename", () => {
  assert.equal(normVenue("PNC Arena"), "lenovo center");
  assert.equal(normVenue("Lenovo Center"), "lenovo center");
});

test("normVenue collapses the Duke Energy Center -> Martin Marietta Center rename", () => {
  assert.equal(
    normVenue("Duke Energy Center for the Performing Arts"),
    "martin marietta center for the performing arts",
  );
  assert.equal(
    normVenue("Martin Marietta Center for the Performing Arts"),
    "martin marietta center for the performing arts",
  );
});

test("normVenue collapses Quail Ridge Books naming variants", () => {
  assert.equal(normVenue("Quail Ridge Bookstore"), "quail ridge books");
  assert.equal(normVenue("Quail Ridge Books"), "quail ridge books");
});

test("computeId matches for one show listed under both arena names", () => {
  const a = ev({ name: "Carolina Hurricanes vs Bruins", venue: "PNC Arena", city: "Raleigh" });
  const b = ev({ name: "Carolina Hurricanes vs Bruins", venue: "Lenovo Center", city: "Raleigh" });
  assert.equal(computeId(a), computeId(b));
});

test("unaliased venue ids are unchanged by the new alias entries", () => {
  // Regression guard: published .ics UIDs are these ids. A venue the alias table
  // does not name must hash exactly as it did before this change.
  const e = ev({ name: "Trivia Night", venue: "Trophy Brewing", city: "Raleigh" });
  assert.equal(computeId(e), "b9e329f6fecb");
});
```

`b9e329f6fecb` is the real pre-change hash, computed against the current
`dedup.ts` while writing this plan (with the `ev()` fixture's default
`start: "2026-06-20T18:00:00-04:00"`). It must still pass after Step 3.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test scripts/dedup.test.ts`

Expected: the four alias tests FAIL (`normVenue("PNC Arena")` returns `"pnc arena"`, not `"lenovo center"`). The regression test also fails with an assertion showing the real hash for Trophy Brewing — copy that actual value into the test now and re-run to confirm that one test passes. It must stay passing through Step 4.

- [ ] **Step 3: Add the alias entries**

In `scripts/lib/dedup.ts`, extend `VENUE_ALIASES` (keys are already `normVenue`-normalized: lowercase, punctuation stripped, leading `the ` removed):

```ts
const VENUE_ALIASES: Record<string, string> = {
  "ncma": "nc museum of art",
  "north carolina museum of art": "nc museum of art",
  "nc art museum": "nc museum of art",
  "dpac": "dpac",
  "durham performing arts center": "dpac",
  "red hat amp": "red hat amphitheater",
  "koka booth": "koka booth amphitheatre",
  "carolina theatre of durham": "carolina theatre",
  "contemporary art museum raleigh": "cam raleigh",
  // Renamed venues — sources still use both names for the same building.
  // PNC's naming rights expired 2024-08-31; the arena became Lenovo Center.
  "pnc arena": "lenovo center",
  // Duke Energy Center for the Performing Arts was renamed in 2023.
  "duke energy center for the performing arts": "martin marietta center for the performing arts",
  "duke energy center": "martin marietta center for the performing arts",
  // Naming variants (no rename, just inconsistent listings).
  "quail ridge bookstore": "quail ridge books",
};
```

Chapel of Bones needs no entry — it has one name, and `normVenue`'s existing lowercase/punctuation handling covers it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test scripts/dedup.test.ts`
Expected: PASS, all tests including the unchanged-id regression guard.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/dedup.ts scripts/dedup.test.ts
git commit -m "fix(dedup): collapse PNC Arena/Lenovo Center and Duke Energy/Martin Marietta renames"
```

---

### Task 2: Sub-venue parent matching

Meymandi Concert Hall is one of four halls inside the Martin Marietta Center. NC Symphony lists the hall; ticketing platforms list the complex. An alias mapping Meymandi *into* the parent would be wrong — it would merge a Meymandi concert with a Raleigh Memorial Auditorium show the same night. The parent relation therefore belongs only in `isSameOccurrence`, never in `normVenue`/`computeId`.

**Files:**
- Modify: `scripts/lib/dedup.ts` (new `VENUE_PARENTS` map + `venueParent()` export; `isSameOccurrence` at `dedup.ts:99-112`)
- Test: `scripts/dedup.test.ts`

**Interfaces:**
- Consumes: `normVenue(venue: string): string` from Task 1.
- Produces: `export function venueParent(venue: string): string | null` — returns the canonical parent complex for a sub-venue, or `null`. Task 3's drift check imports this.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/dedup.test.ts`:

```ts
test("venueParent resolves a hall to its complex and returns null otherwise", () => {
  assert.equal(
    venueParent("Meymandi Concert Hall"),
    "martin marietta center for the performing arts",
  );
  assert.equal(venueParent("Cat's Cradle"), null);
});

test("isSameOccurrence merges one concert listed at the hall and at the complex", () => {
  const hall = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Meymandi Concert Hall",
    start: "2026-08-14T20:00:00-04:00",
  });
  const complex = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Martin Marietta Center for the Performing Arts",
    start: "2026-08-14T20:00:00-04:00",
  });
  assert.equal(isSameOccurrence(hall, complex), true);
});

test("isSameOccurrence keeps different halls in one complex separate", () => {
  // The regression an alias-only fix would have introduced: two DIFFERENT shows
  // in two different halls of the same building on the same night.
  const meymandi = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Meymandi Concert Hall",
    start: "2026-08-14T20:00:00-04:00",
  });
  const memorial = ev({
    name: "Hadestown",
    venue: "Raleigh Memorial Auditorium",
    start: "2026-08-14T20:00:00-04:00",
  });
  assert.equal(isSameOccurrence(meymandi, memorial), false);
});

test("parent matching still respects the +/-90 minute window", () => {
  const hall = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Meymandi Concert Hall",
    start: "2026-08-14T14:00:00-04:00",
  });
  const complex = ev({
    name: "NC Symphony: Beethoven's Ninth",
    venue: "Martin Marietta Center for the Performing Arts",
    start: "2026-08-14T20:00:00-04:00",
  });
  assert.equal(isSameOccurrence(hall, complex), false);
});

test("parent matching does not collapse ids", () => {
  // computeId must stay hall-specific — only isSameOccurrence knows about parents.
  const hall = ev({ name: "Recital", venue: "Meymandi Concert Hall" });
  const complex = ev({ name: "Recital", venue: "Martin Marietta Center for the Performing Arts" });
  assert.notEqual(computeId(hall), computeId(complex));
});
```

Add `venueParent` to the import at the top of `scripts/dedup.test.ts`:

```ts
import { computeId, normName, normVenue, isSameOccurrence, jaccard, tokenSet, venueParent } from "./lib/dedup.js";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test scripts/dedup.test.ts`
Expected: FAIL. TypeScript/tsx reports `venueParent` is not exported, and the hall/complex merge test fails because venue Jaccard between those two names is below 0.6.

- [ ] **Step 3: Implement the parent map and the venue-test disjunct**

In `scripts/lib/dedup.ts`, add after `VENUE_ALIASES`:

```ts
// Sub-venue -> the complex that contains it. Consulted ONLY by isSameOccurrence's
// venue test, never by normVenue/computeId: collapsing a hall into its parent
// would merge distinct shows playing different halls the same night. Keys and
// values are already normVenue-normalized.
const VENUE_PARENTS: Record<string, string> = {
  "meymandi concert hall": "martin marietta center for the performing arts",
  "raleigh memorial auditorium": "martin marietta center for the performing arts",
  "aj fletcher opera theater": "martin marietta center for the performing arts",
  "kennedy theatre": "martin marietta center for the performing arts",
};

/** The complex containing this sub-venue, or null if it isn't a known sub-venue. */
export function venueParent(venue: string): string | null {
  return VENUE_PARENTS[normVenue(venue)] ?? null;
}
```

`venueParent` must be declared after `normVenue` in the file, since it calls it.

Then change the venue test in `isSameOccurrence` (currently `dedup.ts:100-103`):

```ts
  const vA = normVenue(a.venue);
  const vB = normVenue(b.venue);
  const venueMatch =
    vA === vB ||
    jaccard(tokenSet(a.venue), tokenSet(b.venue)) >= 0.6 ||
    // One names a hall, the other the complex containing it. Safe because the
    // +/-90min and title-Jaccard>=0.6 checks below still have to pass.
    venueParent(a.venue) === vB ||
    venueParent(b.venue) === vA;
  if (!venueMatch) return false;
```

Note the parent disjuncts compare against the *other* venue's canonical form, not its parent. Two sibling halls (Meymandi and Memorial Auditorium) share a parent but neither is the other's parent, so they correctly fail the venue test.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test scripts/dedup.test.ts`
Expected: PASS, all tests including every Task 1 test.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/dedup.ts scripts/dedup.test.ts
git commit -m "fix(dedup): match sub-venues to their parent complex without collapsing hall ids"
```

---

### Task 3: The source registry and its validator

**Files:**
- Modify: `scripts/lib/types.ts` (append after `EventsStore`)
- Create: `data/sources.json`
- Modify: `scripts/validate.ts` (imports, new `validateSources()`, wire into `main()`)
- Test: `scripts/validate.test.ts`

**Interfaces:**
- Consumes: `venueParent(venue: string): string | null` from Task 2.
- Produces:
  - `export interface EventSource { id, name, kind, url, city, parent_venue?, venue_aliases?, categories, fetch_blocked?, notes? }`
  - `export interface SourcesRegistry { schema_version: number; sources: EventSource[] }`
  - `export const SOURCE_KINDS: ReadonlyArray<SourceKind>`
  - `export function validateSources(registry: SourcesRegistry): ValidationResult` in `scripts/validate.ts`

- [ ] **Step 1: Add the types**

Append to `scripts/lib/types.ts`, after the `EventsStore` interface:

```ts
export type SourceKind = "venue" | "hub" | "aggregator";

/**
 * A seed discovery source (data/sources.json). The registry is a FLOOR for the
 * weekly run's Phase A sweep, not the search space — see prompts/weekly.md.
 */
export interface EventSource {
  id: string; // unique, kebab-case
  name: string;
  kind: SourceKind;
  url: string;
  city: string;
  /** Containing complex, when this source is a hall inside a larger venue. */
  parent_venue?: string;
  /** Other names sources use for this venue (renames, acronyms, spellings). */
  venue_aliases?: string[];
  categories: string[];
  /** True when the origin 403s a plain fetch but serves via WebFetch. */
  fetch_blocked?: boolean;
  notes?: string;
}

export interface SourcesRegistry {
  schema_version: number;
  sources: EventSource[];
}

export const SOURCE_KINDS: ReadonlyArray<SourceKind> = ["venue", "hub", "aggregator"];
```

- [ ] **Step 2: Write the failing validator tests**

Append to `scripts/validate.test.ts`:

```ts
function src(over: Partial<EventSource> = {}): EventSource {
  return {
    id: "ncma",
    name: "North Carolina Museum of Art",
    kind: "venue",
    url: "https://ncartmuseum.org/events/",
    city: "Raleigh",
    categories: ["museums"],
    ...over,
  };
}

test("validateSources accepts a well-formed registry", () => {
  const { errors } = validateSources({ schema_version: 1, sources: [src()] });
  assert.deepEqual(errors, []);
});

test("validateSources rejects duplicate source ids", () => {
  const { errors } = validateSources({
    schema_version: 1,
    sources: [src(), src({ name: "NCMA duplicate" })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /duplicate source id "ncma"/);
});

test("validateSources rejects a malformed url", () => {
  const { errors } = validateSources({ schema_version: 1, sources: [src({ url: "ncartmuseum.org" })] });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /url/);
});

test("validateSources rejects an unknown kind", () => {
  const { errors } = validateSources({
    schema_version: 1,
    sources: [src({ kind: "podcast" as never })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /kind/);
});

test("validateSources rejects a parent_venue dedup.ts does not know", () => {
  // The anti-drift check: registering a nested venue without teaching dedup.ts
  // about it must fail the build, or cross-source dupes slip through silently.
  const { errors } = validateSources({
    schema_version: 1,
    sources: [src({ id: "some-hall", name: "Some Hall", parent_venue: "Nonexistent Complex" })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /parent_venue/);
});

test("validateSources accepts a parent_venue dedup.ts does know", () => {
  const { errors } = validateSources({
    schema_version: 1,
    sources: [
      src({
        id: "meymandi-concert-hall",
        name: "Meymandi Concert Hall",
        parent_venue: "Martin Marietta Center for the Performing Arts",
      }),
    ],
  });
  assert.deepEqual(errors, []);
});
```

Update the imports at the top of `scripts/validate.test.ts`:

```ts
import { validateEvents, validateSources, type DateWindow } from "./validate.js";
import type { EventSource, TriangleEvent } from "./lib/types.js";
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --import tsx --test scripts/validate.test.ts`
Expected: FAIL — `validateSources` is not exported from `./validate.js`.

- [ ] **Step 4: Implement `validateSources`**

In `scripts/validate.ts`, extend the imports:

```ts
import {
  BUDGETS,
  COVERAGE_CATEGORIES,
  INDOOR_OUTDOOR,
  SOURCE_KINDS,
  YES_NO_UNKNOWN,
  type EventsStore,
  type SourceKind,
  type SourcesRegistry,
  type TriangleEvent,
} from "./lib/types.js";
import { normVenue, venueParent } from "./lib/dedup.js";
```

Add the source path constant beside `SRC`:

```ts
const SOURCES = join(ROOT, "data", "sources.json");
```

Add the validator (place it after `validateEvents`):

```ts
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
  });

  return { errors, warnings };
}
```

The `.includes(... as (typeof X)[number])` cast matches the existing idiom at `scripts/validate.ts:78`. Add `type SourceKind` to the `./lib/types.js` import.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --import tsx --test scripts/validate.test.ts`
Expected: PASS.

- [ ] **Step 6: Create `data/sources.json`**

Every URL below was fetched and confirmed 2xx while planning; redirects are already resolved to their final destination. Do not "clean up" or shorten them.

```json
{
  "schema_version": 1,
  "sources": [
    { "id": "nc-museum-of-art", "name": "North Carolina Museum of Art", "kind": "venue", "url": "https://ncartmuseum.org/events/", "city": "Raleigh", "venue_aliases": ["NCMA", "NC Art Museum"], "categories": ["museums", "galleries", "concerts", "family/kids"], "notes": "Also runs Museum Park outdoor programming and the Market at NCMA" },
    { "id": "meymandi-concert-hall", "name": "Meymandi Concert Hall", "kind": "venue", "url": "https://www.martinmariettacenter.com/events", "city": "Raleigh", "parent_venue": "Martin Marietta Center for the Performing Arts", "venue_aliases": ["Meymandi", "Duke Energy Center for the Performing Arts"], "categories": ["concerts", "theater"], "notes": "NC Symphony's home; one of four halls in the complex. Complex calendar covers all four." },
    { "id": "quail-ridge-books", "name": "Quail Ridge Books", "kind": "venue", "url": "https://quailridgebooks.com/events", "city": "Raleigh", "venue_aliases": ["Quail Ridge Bookstore"], "categories": ["shopping", "classes", "family/kids"], "fetch_blocked": true, "notes": "403s a plain fetch (bot protection); reachable via WebFetch. Author readings, mostly free." },
    { "id": "lenovo-center", "name": "Lenovo Center", "kind": "venue", "url": "https://www.lenovocenter.com/events", "city": "Raleigh", "venue_aliases": ["PNC Arena", "RBC Center"], "categories": ["sports", "concerts"], "notes": "Hurricanes + NC State men's basketball + arena tours. Expect zero hits mid-summer." },
    { "id": "red-hat-amphitheater", "name": "Red Hat Amphitheater", "kind": "venue", "url": "https://www.redhatamphitheater.com/events/", "city": "Raleigh", "venue_aliases": ["Red Hat Amp"], "categories": ["concerts"], "notes": "Outdoor; seasonal (roughly May-October)" },
    { "id": "chapel-of-bones", "name": "Chapel of Bones", "kind": "venue", "url": "https://chapelofbones.com/events/", "city": "Raleigh", "categories": ["concerts", "nightlife", "trivia", "markets"], "notes": "658 Maywood Ave. Metal venue + coffee lounge; also karaoke, burlesque, yoga, art pop-ups" },
    { "id": "nc-state-calendar", "name": "NC State University", "kind": "hub", "url": "https://calendar.ncsu.edu/", "city": "Raleigh", "categories": ["classes", "concerts", "theater", "galleries", "sports"], "notes": "Central calendar mixes public and academic events — filter to public" },
    { "id": "unc-calendar", "name": "UNC Chapel Hill", "kind": "hub", "url": "https://calendar.unc.edu/", "city": "Chapel Hill", "categories": ["classes", "concerts", "theater", "galleries", "sports"], "notes": "events.unc.edu redirects here" },
    { "id": "duke-calendar", "name": "Duke University", "kind": "hub", "url": "https://calendar.duke.edu/", "city": "Durham", "categories": ["classes", "concerts", "theater", "galleries", "sports"] },
    { "id": "wake-forest-town", "name": "Town of Wake Forest", "kind": "hub", "url": "https://www.wakeforestnc.gov/events", "city": "Wake Forest", "categories": ["festivals", "markets", "parks", "family/kids", "concerts"], "notes": "The TOWN of Wake Forest, NC. Wake Forest University (Winston-Salem) is out of radius." },

    { "id": "gregg-museum", "name": "Gregg Museum of Art & Design", "kind": "venue", "url": "https://gregg.arts.ncsu.edu/", "city": "Raleigh", "categories": ["museums", "galleries"], "notes": "NC State" },
    { "id": "nc-state-live", "name": "NC State LIVE", "kind": "venue", "url": "https://live.arts.ncsu.edu/", "city": "Raleigh", "categories": ["theater", "concerts"], "notes": "NC State performing arts, incl. Stewart Theatre" },
    { "id": "nc-state-athletics", "name": "NC State Athletics", "kind": "venue", "url": "https://gopack.com/calendar", "city": "Raleigh", "categories": ["sports"] },
    { "id": "ackland-art-museum", "name": "Ackland Art Museum", "kind": "venue", "url": "https://events.ackland.org/events/", "city": "Chapel Hill", "categories": ["museums", "galleries"], "notes": "UNC" },
    { "id": "carolina-performing-arts", "name": "Carolina Performing Arts", "kind": "venue", "url": "https://carolinaperformingarts.org/current-season/", "city": "Chapel Hill", "categories": ["concerts", "theater"], "notes": "UNC; Memorial Hall" },
    { "id": "morehead-planetarium", "name": "Morehead Planetarium and Science Center", "kind": "venue", "url": "https://moreheadplanetarium.org/calendar/", "city": "Chapel Hill", "categories": ["museums", "family/kids", "classes"], "notes": "UNC" },
    { "id": "unc-athletics", "name": "UNC Athletics", "kind": "venue", "url": "https://goheels.com/calendar", "city": "Chapel Hill", "categories": ["sports"] },
    { "id": "nasher-museum", "name": "Nasher Museum of Art", "kind": "venue", "url": "https://nasher.duke.edu/events/", "city": "Durham", "categories": ["museums", "galleries"], "notes": "Duke" },
    { "id": "duke-gardens", "name": "Sarah P. Duke Gardens", "kind": "venue", "url": "https://gardens.duke.edu/calendar/", "city": "Durham", "categories": ["parks", "classes", "family/kids"], "notes": "Duke" },
    { "id": "duke-athletics", "name": "Duke Athletics", "kind": "venue", "url": "https://goduke.com/calendar", "city": "Durham", "categories": ["sports"] },

    { "id": "triangle-on-the-cheap", "name": "Triangle on the Cheap", "kind": "aggregator", "url": "https://triangleonthecheap.com/", "city": "Raleigh", "categories": ["festivals", "markets", "family/kids", "food events"], "notes": "Best single source for free and cheap events" },
    { "id": "visit-raleigh", "name": "Visit Raleigh", "kind": "aggregator", "url": "https://www.visitraleigh.com/events/", "city": "Raleigh", "categories": ["festivals", "concerts", "theater", "food events"] },
    { "id": "discover-durham", "name": "Discover Durham", "kind": "aggregator", "url": "https://www.discoverdurham.com/events/", "city": "Durham", "categories": ["festivals", "concerts", "tours", "food events"] },
    { "id": "visit-chapel-hill", "name": "Visit Chapel Hill", "kind": "aggregator", "url": "https://www.visitchapelhill.org/events/", "city": "Chapel Hill", "categories": ["festivals", "concerts", "food events"] },
    { "id": "dpac", "name": "Durham Performing Arts Center", "kind": "venue", "url": "https://www.dpacnc.com/events", "city": "Durham", "venue_aliases": ["DPAC"], "categories": ["theater", "concerts", "comedy"] },
    { "id": "koka-booth-amphitheatre", "name": "Koka Booth Amphitheatre", "kind": "venue", "url": "https://www.boothamphitheatre.com/events/", "city": "Cary", "venue_aliases": ["Koka Booth"], "categories": ["concerts", "festivals"], "notes": "Outdoor; seasonal" },
    { "id": "cats-cradle", "name": "Cat's Cradle", "kind": "venue", "url": "https://catscradle.com/", "city": "Carrboro", "categories": ["concerts", "nightlife"] },
    { "id": "carolina-theatre-durham", "name": "Carolina Theatre of Durham", "kind": "venue", "url": "https://carolinatheatre.org/events/", "city": "Durham", "categories": ["theater", "concerts", "comedy"] },
    { "id": "goodnights-comedy", "name": "Goodnights Comedy Club", "kind": "venue", "url": "https://www.goodnightscomedy.com/", "city": "Raleigh", "categories": ["comedy", "nightlife"] },
    { "id": "comedyworx", "name": "ComedyWorx", "kind": "venue", "url": "https://www.comedyworx.com/", "city": "Raleigh", "categories": ["comedy"] },
    { "id": "nc-museum-natural-sciences", "name": "NC Museum of Natural Sciences", "kind": "venue", "url": "https://www.naturalsciences.org/calendar/", "city": "Raleigh", "categories": ["museums", "family/kids", "classes"] },
    { "id": "life-and-science", "name": "Museum of Life and Science", "kind": "venue", "url": "https://www.lifeandscience.org/explore/events/", "city": "Durham", "categories": ["museums", "family/kids"] },
    { "id": "durham-bulls", "name": "Durham Bulls", "kind": "venue", "url": "https://www.milb.com/durham/schedule", "city": "Durham", "categories": ["sports"] },
    { "id": "pour-house", "name": "The Pour House Music Hall", "kind": "venue", "url": "https://www.pourhouseraleigh.com/calendar", "city": "Raleigh", "categories": ["concerts", "nightlife"] },
    { "id": "lincoln-theatre", "name": "Lincoln Theatre", "kind": "venue", "url": "https://lincolntheatre.com/", "city": "Raleigh", "categories": ["concerts", "nightlife"] },
    { "id": "kings-raleigh", "name": "Kings", "kind": "venue", "url": "https://www.kingsraleigh.com/", "city": "Raleigh", "categories": ["concerts", "nightlife", "comedy"] },
    { "id": "local-506", "name": "Local 506", "kind": "venue", "url": "https://local506.com/events/", "city": "Chapel Hill", "categories": ["concerts", "nightlife"] },
    { "id": "the-pinhook", "name": "The Pinhook", "kind": "venue", "url": "https://thepinhook.com/", "city": "Durham", "categories": ["concerts", "nightlife"] },
    { "id": "glass-jug", "name": "Glass Jug Beer Lab", "kind": "venue", "url": "https://www.glass-jug.com/events/", "city": "Durham", "categories": ["breweries/tastings", "trivia"] },
    { "id": "ponysaurus", "name": "Ponysaurus Brewing", "kind": "venue", "url": "https://www.ponysaurusbrewing.com/events", "city": "Durham", "categories": ["breweries/tastings", "trivia"] },
    { "id": "compass-rose", "name": "Compass Rose Brewery", "kind": "venue", "url": "https://compassrosebrewery.com/raleigh-compass-rose-brewery-events", "city": "Raleigh", "categories": ["breweries/tastings", "trivia"] },
    { "id": "raleigh-brewing", "name": "Raleigh Brewing Company", "kind": "venue", "url": "https://www.raleighbrewing.com/events", "city": "Raleigh", "categories": ["breweries/tastings", "trivia"] },
    { "id": "raleigh-little-theatre", "name": "Raleigh Little Theatre", "kind": "venue", "url": "https://raleighlittletheatre.org/shows-and-events/", "city": "Raleigh", "categories": ["theater"] },
    { "id": "theatre-raleigh", "name": "Theatre Raleigh", "kind": "venue", "url": "https://www.theatreraleigh.com/events", "city": "Raleigh", "categories": ["theater"] },
    { "id": "dix-park", "name": "Dorothea Dix Park", "kind": "venue", "url": "https://dixpark.org/events", "city": "Raleigh", "categories": ["parks", "festivals", "family/kids"] },
    { "id": "raleigh-city-events", "name": "City of Raleigh", "kind": "hub", "url": "https://raleighnc.gov/events", "city": "Raleigh", "categories": ["parks", "festivals", "family/kids", "classes"] },
    { "id": "cary-events", "name": "Town of Cary", "kind": "hub", "url": "https://www.carync.gov/recreation-enjoyment/events", "city": "Cary", "categories": ["parks", "festivals", "family/kids", "classes"] },
    { "id": "nc-historic-sites", "name": "NC DNCR Events", "kind": "hub", "url": "https://events.dncr.nc.gov/", "city": "Raleigh", "categories": ["historic sites", "museums", "tours"], "notes": "Statewide — filter to Triangle sites (Stagville, Bennett Place, Capitol, Mordecai)" }
  ]
}
```

That is 48 sources: 10 requested, 10 university sub-venues, 28 carried over from the routine's inline list and the existing store.

- [ ] **Step 7: Wire registry validation into `main()`**

In `scripts/validate.ts`, inside `main()`, after the existing `validateEvents` call and before the warning/error printing:

```ts
  const rawSources = await readFile(SOURCES, "utf8");
  const registry = JSON.parse(rawSources) as SourcesRegistry;
  const srcResult = validateSources(registry);
  errors.push(...srcResult.errors);
  warnings.push(...srcResult.warnings);
```

`validateEvents` returns a destructured `{ errors, warnings }`, so change that line to keep mutable arrays:

```ts
  const { errors, warnings } = validateEvents(events, todayWindow(new Date()));
```
becomes
```ts
  const eventResult = validateEvents(events, todayWindow(new Date()));
  const errors = [...eventResult.errors];
  const warnings = [...eventResult.warnings];
```

Update the summary line at the end of `main()` to report the registry size:

```ts
  console.log(
    `validate: ${events.length} event(s), ${registry.sources.length} source(s), ` +
      `${errors.length} error(s), ${warnings.length} warning(s)` +
      (checkLinksFlag ? `, ${linkProblems.length} link issue(s)` : ""),
  );
```

- [ ] **Step 8: Run the full gate**

```bash
npm test && npm run typecheck && npm run validate
```

Expected: all tests pass; `npm run validate` reports 48 sources and 0 errors. If the `parent_venue` drift check errors on `meymandi-concert-hall`, Task 2's `VENUE_PARENTS` is missing the entry — fix it there, not by weakening the check.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/types.ts scripts/validate.ts scripts/validate.test.ts data/sources.json
git commit -m "feat(sources): add 48-source seed registry with schema validation"
```

---

### Task 4: Registry link health under `--check-links`

**Files:**
- Modify: `scripts/validate.ts` (`checkLinks` area, `dedup.ts:163-183` equivalent region, and `main()`)

**Interfaces:**
- Consumes: `EventSource` and `SourcesRegistry` from Task 3; the existing private `checkUrl(url): Promise<{url, ok, status}>` at `scripts/validate.ts:150`.
- Produces: `async function checkSourceLinks(sources: EventSource[]): Promise<string[]>` (module-private, used only by `main()`).

- [ ] **Step 1: Implement the source link check**

In `scripts/validate.ts`, add after the existing `checkLinks` function:

```ts
/**
 * HTTP-check registry URLs. Sources marked fetch_blocked are skipped: their
 * origin 403s a scripted fetch but serves fine through WebFetch, and failing
 * the build on them would abort a healthy weekly run.
 */
async function checkSourceLinks(sources: EventSource[]): Promise<string[]> {
  const problems: string[] = [];
  const targets = sources.filter((s) => !s.fetch_blocked && URL_RE.test(s.url ?? ""));
  const skipped = sources.filter((s) => s.fetch_blocked).length;
  if (skipped > 0) console.log(`validate: skipping ${skipped} fetch_blocked source(s)`);

  const results = await Promise.allSettled(targets.map((t) => checkUrl(t.url)));
  results.forEach((r, i) => {
    const t = targets[i]!;
    if (r.status === "fulfilled" && !r.value.ok) {
      problems.push(`source "${t.id}": ${r.value.status} (${t.url})`);
    } else if (r.status === "rejected") {
      problems.push(`source "${t.id}": fetch error (${t.url})`);
    }
  });
  return problems;
}
```

Add `type EventSource` to the `./lib/types.js` import list.

- [ ] **Step 2: Wire it into `main()`**

Extend the existing `if (checkLinksFlag)` block:

```ts
  let linkProblems: string[] = [];
  if (checkLinksFlag) {
    console.log("validate: checking link health (booking/info/image + sources)…");
    linkProblems = [...(await checkLinks(events)), ...(await checkSourceLinks(registry.sources))];
    for (const p of linkProblems) console.error(`  LINK: ${p}`);
  }
```

- [ ] **Step 3: Verify the offline path is unchanged**

Run: `npm run validate`
Expected: no network calls for sources; output reports 48 sources, 0 errors. This must stay fast — `run.sh` gates the weekly build on it.

- [ ] **Step 4: Verify the online path works**

Run: `npm run validate:links`
Expected: reports skipping 1 `fetch_blocked` source (Quail Ridge Books) and finds 0 problems among the other 47 registry URLs. Event links may report their own pre-existing problems; those are not this task's concern — note them but do not fix them here.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate.ts
git commit -m "feat(validate): HTTP-check registry sources under --check-links, skipping fetch_blocked"
```

---

### Task 5: Coverage telemetry shape and validator

The weekly run writes `data/source_coverage.json`. Nothing consumes it programmatically — it is read by a human in the PR body — but an unvalidated file the model writes will drift, so validate its shape.

**Files:**
- Modify: `scripts/lib/types.ts` (append `SourceCoverage`)
- Modify: `scripts/validate.ts` (`validateCoverage()`, wire into `main()`)
- Test: `scripts/validate.test.ts`

**Interfaces:**
- Consumes: `SourcesRegistry` from Task 3.
- Produces: `export interface SourceCoverage` in types; `export function validateCoverage(coverage: SourceCoverage, registry: SourcesRegistry): ValidationResult` in `scripts/validate.ts`.

- [ ] **Step 1: Add the type**

Append to `scripts/lib/types.ts`:

```ts
/**
 * Per-run discovery telemetry (data/source_coverage.json). Read by a human in
 * the PR body — nothing consumes it programmatically. Its job is to surface a
 * seed that has quietly stopped producing, and to show whether open-ended
 * discovery is still pulling its weight against the registry.
 */
export interface SourceCoverage {
  week: string;
  generated_at: string;
  /** source id -> events contributed this run */
  per_source: Record<string, number>;
  /** ids from per_source that contributed 0 */
  zero_hit: string[];
  off_registry_sources: number;
  off_registry_events: number;
  total_events: number;
}
```

- [ ] **Step 2: Write the failing tests**

Append to `scripts/validate.test.ts`:

```ts
function coverage(over: Partial<SourceCoverage> = {}): SourceCoverage {
  return {
    week: "2026-W32",
    generated_at: "2026-08-06T11:14:00-04:00",
    per_source: { ncma: 5, "lenovo-center": 0 },
    zero_hit: ["lenovo-center"],
    off_registry_sources: 11,
    off_registry_events: 62,
    total_events: 141,
    ...over,
  };
}

const registryFixture = {
  schema_version: 1,
  sources: [src(), src({ id: "lenovo-center", name: "Lenovo Center" })],
};

test("validateCoverage accepts a well-formed report", () => {
  const { errors } = validateCoverage(coverage(), registryFixture);
  assert.deepEqual(errors, []);
});

test("validateCoverage rejects a per_source id not in the registry", () => {
  const { errors } = validateCoverage(
    coverage({ per_source: { "not-a-source": 3 }, zero_hit: [] }),
    registryFixture,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /not-a-source/);
});

test("validateCoverage rejects a zero_hit entry that reported hits", () => {
  const { errors } = validateCoverage(coverage({ zero_hit: ["ncma"] }), registryFixture);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /zero_hit/);
});

test("validateCoverage warns when off-registry share falls below the 40% quota", () => {
  const { errors, warnings } = validateCoverage(
    coverage({ off_registry_events: 10, total_events: 141 }),
    registryFixture,
  );
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /off-registry/);
});
```

Add `validateCoverage` to the `./validate.js` import and `SourceCoverage` to the `./lib/types.js` type import.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --import tsx --test scripts/validate.test.ts`
Expected: FAIL — `validateCoverage` is not exported.

- [ ] **Step 4: Implement `validateCoverage`**

In `scripts/validate.ts`:

```ts
/** Fraction of a run's events that must come from outside the registry. */
const OFF_REGISTRY_QUOTA = 0.4;

/**
 * Pure validator for data/source_coverage.json — no I/O. The quota check is a
 * WARNING, not an error: a genuinely quiet week shouldn't abort the build, but
 * a sustained dip means the registry is crowding out open discovery.
 */
export function validateCoverage(
  coverage: SourceCoverage,
  registry: SourcesRegistry,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const known = new Set((registry.sources ?? []).map((s) => s.id));
  const perSource = coverage?.per_source ?? {};

  for (const id of Object.keys(perSource)) {
    if (!known.has(id)) errors.push(`source_coverage.json: per_source id "${id}" is not in sources.json`);
  }

  for (const id of coverage?.zero_hit ?? []) {
    const n = perSource[id];
    if (n === undefined) {
      errors.push(`source_coverage.json: zero_hit id "${id}" is missing from per_source`);
    } else if (n !== 0) {
      errors.push(`source_coverage.json: zero_hit id "${id}" reported ${n} event(s)`);
    }
  }

  const total = coverage?.total_events ?? 0;
  if (total > 0) {
    const share = (coverage?.off_registry_events ?? 0) / total;
    if (share < OFF_REGISTRY_QUOTA) {
      warnings.push(
        `source_coverage.json: off-registry share ${(share * 100).toFixed(0)}% is below the ` +
          `${OFF_REGISTRY_QUOTA * 100}% quota — Phase B discovery may be getting crowded out`,
      );
    }
  }

  return { errors, warnings };
}
```

- [ ] **Step 5: Wire it into `main()` (optional file)**

The file won't exist until the first run under the new prompt, so treat absence as fine. In `main()`, after the registry validation block:

```ts
  const COVERAGE = join(ROOT, "data", "source_coverage.json");
  try {
    const rawCoverage = await readFile(COVERAGE, "utf8");
    const cov = validateCoverage(JSON.parse(rawCoverage) as SourceCoverage, registry);
    errors.push(...cov.errors);
    warnings.push(...cov.warnings);
  } catch (err) {
    // ENOENT is expected before the first run under the new prompt. Anything
    // else (malformed JSON, unreadable file) is a real problem — surface it.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      errors.push(`source_coverage.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
```

Move the `COVERAGE` constant up beside `SRC` and `SOURCES` rather than declaring it inside `main()`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test && npm run typecheck && npm run validate`
Expected: PASS; `npm run validate` still reports 0 errors (no coverage file yet).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/types.ts scripts/validate.ts scripts/validate.test.ts
git commit -m "feat(validate): validate per-run source coverage telemetry"
```

---

### Task 6: Two-phase discovery in the prompts and docs

The behavior change. Everything before this was scaffolding; this is what actually alters what the weekly run does.

**Files:**
- Modify: `prompts/weekly.md:20-23` (step 3) and the outputs list at `prompts/weekly.md:32-39` (step 7)
- Modify: `CLAUDE.md` (repo layout block; § Dedup)
- Modify: `~/.claude/scheduled-tasks/weekly-triangle-events/SKILL.md` (step 4, step 9, step 12)

**Interfaces:**
- Consumes: `data/sources.json` and `data/source_coverage.json` from Tasks 3 and 5.
- Produces: no code.

- [ ] **Step 1: Replace step 3 of `prompts/weekly.md`**

Replace the existing step 3 ("**Discover** events across every category…") with:

```markdown
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
   If you are short of either when you think you're done, keep searching.

   `data/sources.json` is a floor, not a search space. A seed returning nothing
   is never evidence an event doesn't exist. A satisfying Phase A count is never
   a reason to shorten Phase B.

   Prefer primary sources for accurate times, prices, and booking links.
```

- [ ] **Step 2: Add the coverage report to step 7 of `prompts/weekly.md`**

In the step 7 outputs list, after the `data/itineraries.json` bullet, add:

```markdown
   - `data/source_coverage.json` — this run's discovery telemetry:
     `{ week, generated_at, per_source: { "<source id>": <count> }, zero_hit: [<ids with 0>],
     off_registry_sources, off_registry_events, total_events }`. Every key in
     `per_source` must be an `id` from `data/sources.json`; `npm run validate`
     enforces that and warns if the off-registry share is under 40%.
```

- [ ] **Step 3: Update `CLAUDE.md`**

In the "Repo layout (target)" block, add under `data/`:

```
│   ├── sources.json           # seed discovery registry (Phase A floor)
│   ├── source_coverage.json   # per-run discovery telemetry
```

In the § Dedup section, after the "Venue alias map" table, add:

```markdown
**Renamed venues.** Two Triangle venues were renamed recently and sources still
use both names: PNC Arena → **Lenovo Center** (naming rights expired 2024-08-31)
and Duke Energy Center for the Performing Arts → **Martin Marietta Center for
the Performing Arts** (2023). Both pairs are in the alias map, so one show listed
under either name hashes to a single id.

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
`VENUE_PARENTS` doesn't know, so the registry and the dedup rules can't drift.
```

- [ ] **Step 4: Update the routine's `SKILL.md`**

In `~/.claude/scheduled-tasks/weekly-triangle-events/SKILL.md`, replace the inline domain list in step 4 (everything from "Use web search + fetch against primary and aggregator sources — e.g. …" through "…and town/parks calendars.") with:

```
Discovery runs in two phases, defined in `prompts/weekly.md` step 3: Phase A sweeps every seed in `data/sources.json`, Phase B searches openly and must contribute at least 40% of the run's events from at least 8 sources outside the registry. Do NOT maintain a source list in this file — `data/sources.json` is the single registry, and adding venues here instead is how the two prompts drifted apart before.
```

In step 9's output list, add:

```
   - `data/source_coverage.json` — per-run discovery telemetry (see prompts/weekly.md step 7).
```

In step 12, extend the PR body requirement:

```
...whose body summarizes the counts, the categories/cities covered, any verification caveats, and a Discovery Coverage section listing the zero-hit seed ids from `data/source_coverage.json` plus the off-registry share (`off_registry_events` / `total_events`).
```

- [ ] **Step 5: Verify the prompt and spec agree**

Read `prompts/weekly.md` step 3 and `CLAUDE.md` § Dedup side by side against
`docs/superpowers/specs/2026-08-01-event-source-registry-design.md` §2 and §3.
The 40% figure, the 8-source figure, and the anti-anchoring wording must match
the spec exactly. `CLAUDE.md` wins on conflict per the repo's own rule, so if
they disagree, fix the prompt.

- [ ] **Step 6: Run the full gate**

```bash
npm test && npm run typecheck && npm run validate && npm run build
```

Expected: all green. `npm run build` writes `public/events.ics`, `public/events.json`, and `public/itineraries.json` as before — this change touches none of them.

- [ ] **Step 7: Commit**

```bash
git add prompts/weekly.md CLAUDE.md
git commit -m "feat(prompts): two-phase discovery with a registry floor and an off-registry quota"
```

The routine's `SKILL.md` lives outside the repo at `~/.claude/scheduled-tasks/`, so it is not part of this commit. Note in the PR body that it was edited and must not be reverted.

---

## Final verification

- [ ] `npm test` — all tests pass; report the count explicitly (e.g. "31 passing, 0 failing"), not "tests pass".
- [ ] `npm run typecheck` — clean.
- [ ] `npm run validate` — 48 sources, 0 errors.
- [ ] `npm run validate:links` — 1 `fetch_blocked` source skipped, 0 registry link problems.
- [ ] `npm run build` — green.
- [ ] `git diff main --stat` shows no changes under `site/`, `public/`, or `data/events.json`.
- [ ] Open a PR against `main` from `claude/event-search-locations-1c8ed1`. Do not enable auto-merge. The PR body must note the out-of-repo `SKILL.md` edit.

## Follow-up issues to offer

After the PR is open, offer to file these — do not implement them here:

1. **Revisit the 40% off-registry quota** after two weekly runs, using the real
   `source_coverage.json` numbers. The figure is currently a judgment call with
   no baseline.
2. **Tier the registry** if Phase A's 48 fetches make the run time out — a core
   weekly subset plus a monthly full sweep, rather than deleting seeds.
3. **Drop or replace hub entries whose central calendar proves unusable.**
   University calendars mix public and academic events; if `calendar.ncsu.edu`,
   `calendar.unc.edu`, or `calendar.duke.edu` can't be filtered by fetch alone,
   fall back to their sub-venue entries and record why in the entry's `notes`.
