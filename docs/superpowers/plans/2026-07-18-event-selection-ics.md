# Event Selection → Itinerary .ics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user tick checkboxes on events across the card and table views and export exactly that hand-picked set as a single `.ics`.

**Architecture:** Pure selection logic (parse / prune / derive) lives in `site/src/lib/selection.ts` and is unit-tested; a `useSelection` hook binds it to React state and `localStorage`; `EventsExplorer` owns the hook and threads `isSelected`/`toggle` down to `EventCard` (via `GroupedView`) and `TableView`. A fixed bottom `SelectionBar` renders the count and the export action. This mirrors the existing `lib/theme.ts` + `lib/useTheme.ts` split already used in the codebase.

**Tech Stack:** React 18, TypeScript, Vite 6, Vitest 3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-18-event-selection-ics-design.md`

## Global Constraints

- **No new dependencies.** Everything here uses what is already in `site/package.json`.
- **Vitest runs in the `node` environment** — there is no `jsdom` and no DOM testing library. `localStorage`, `document`, and React components are therefore **not** available in tests. All tested logic must be pure functions over plain data. This is why `site/src/lib/theme.test.ts` tests only `resolveInitialTheme` and never `getStoredTheme`, and why `useTheme.ts` has no test file. Follow that precedent exactly.
- **Do not modify `site/src/lib/ics.ts` or `scripts/lib/ics.ts`.** The client builder is a deliberate mirror of the server builder; changing one silently desynchronises the downloaded `.ics` from the published `events.ics`. The export path here calls the existing `downloadIcs` unchanged.
- **Selection is independent of the active filters.** A picked event that is currently filtered out still counts in the bar and still appears in the export.
- **localStorage key:** `tw:selection` (exact string).
- **Export filename:** `triangle-weekend-itinerary`. **Calendar name:** `Triangle Weekend — My Itinerary` (note the em dash, matching the existing `Triangle Weekend — All Events`).
- **CSS uses the existing custom-property tokens** (`--card`, `--line`, `--ink`, `--ink-2`, `--green`, `--pill`, `--shadow-md`). Do not hardcode colours — the site has a light/dark toggle driven by these tokens.
- **Commit style:** conventional prefixes (`feat:`, `test:`, `refactor:`).

---

### Task 1: Pure selection logic

**Files:**
- Create: `site/src/lib/selection.ts`
- Test: `site/src/lib/selection.test.ts`

**Interfaces:**
- Consumes: `TriangleEvent` from `site/src/types.ts`; the `makeEvent(over?: Partial<TriangleEvent>): TriangleEvent` factory from `site/src/test/factory.ts`.
- Produces:
  - `SELECTION_STORAGE_KEY: string`
  - `parseSelection(raw: string | null): string[]`
  - `pruneSelection(ids: string[], events: TriangleEvent[]): string[]`
  - `selectedEvents(events: TriangleEvent[], ids: string[]): TriangleEvent[]`
  - `getStoredSelection(): string[]`
  - `storeSelection(ids: string[]): void`

- [ ] **Step 1: Write the failing test**

Create `site/src/lib/selection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeEvent } from "../test/factory";
import { parseSelection, pruneSelection, selectedEvents } from "./selection";

describe("parseSelection", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(parseSelection(null)).toEqual([]);
    expect(parseSelection("")).toEqual([]);
  });
  it("returns an empty list for corrupt JSON", () => {
    expect(parseSelection("{not json")).toEqual([]);
  });
  it("returns an empty list for valid JSON that isn't an array", () => {
    expect(parseSelection('{"a":1}')).toEqual([]);
    expect(parseSelection('"e1"')).toEqual([]);
  });
  it("round-trips a stored id list", () => {
    expect(parseSelection(JSON.stringify(["e1", "e2"]))).toEqual(["e1", "e2"]);
  });
  it("drops non-string members of a stored array", () => {
    expect(parseSelection('["e1",7,null,"e2"]')).toEqual(["e1", "e2"]);
  });
});

describe("pruneSelection", () => {
  const events = [makeEvent({ id: "e1" }), makeEvent({ id: "e2" })];

  it("keeps ids that still exist in the event set", () => {
    expect(pruneSelection(["e1", "e2"], events)).toEqual(["e1", "e2"]);
  });
  it("drops ids the weekly refresh removed", () => {
    expect(pruneSelection(["e1", "gone", "e2"], events)).toEqual(["e1", "e2"]);
  });
  it("returns an empty list when no id survives", () => {
    expect(pruneSelection(["gone"], events)).toEqual([]);
  });
});

describe("selectedEvents", () => {
  const early = makeEvent({ id: "early", start: "2026-06-20T09:00:00-04:00" });
  const mid = makeEvent({ id: "mid", start: "2026-06-20T14:00:00-04:00" });
  const late = makeEvent({ id: "late", start: "2026-06-21T19:00:00-04:00" });
  const events = [late, early, mid];

  it("returns the picked events in chronological order", () => {
    expect(selectedEvents(events, ["late", "early", "mid"]).map((e) => e.id)).toEqual(["early", "mid", "late"]);
  });
  it("ignores ids with no matching event", () => {
    expect(selectedEvents(events, ["mid", "gone"]).map((e) => e.id)).toEqual(["mid"]);
  });
  it("returns an empty list when nothing is picked", () => {
    expect(selectedEvents(events, [])).toEqual([]);
  });
  it("does not mutate the input event list", () => {
    const input = [late, early, mid];
    selectedEvents(input, ["early", "late"]);
    expect(input.map((e) => e.id)).toEqual(["late", "early", "mid"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd site && npm test -- selection
```

Expected: FAIL — `Failed to resolve import "./selection"`.

- [ ] **Step 3: Write the implementation**

Create `site/src/lib/selection.ts`:

```ts
// Hand-picked event selection behind the "itinerary .ics" export.
//
// Same split as theme.ts: the parsing/derivation logic is pure and unit-tested,
// while the localStorage touch is a thin try/catch wrapper. The Vitest run has
// no DOM, so storage itself is exercised in the browser, not in tests.

import type { TriangleEvent } from "../types";

export const SELECTION_STORAGE_KEY = "tw:selection";

/**
 * Parse a raw localStorage payload into an id list. Tolerates every shape a
 * corrupted or hand-edited key can take — anything unexpected means "nothing
 * picked" rather than a crash on mount.
 */
export function parseSelection(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === "string");
}

/**
 * Drop ids that no longer exist in the event set. events.json refreshes weekly
 * and drops past events; without this the stored list would grow without bound
 * and the selection count would overstate what actually exports.
 */
export function pruneSelection(ids: string[], events: TriangleEvent[]): string[] {
  const live = new Set(events.map((ev) => ev.id));
  return ids.filter((id) => live.has(id));
}

/**
 * The picked events in chronological order — an itinerary reads in time order
 * regardless of the sort the user happens to be browsing with.
 */
export function selectedEvents(events: TriangleEvent[], ids: string[]): TriangleEvent[] {
  const picked = new Set(ids);
  return events
    .filter((ev) => picked.has(ev.id))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/** Read the persisted selection, tolerating disabled/throwing storage. */
export function getStoredSelection(): string[] {
  try {
    return parseSelection(localStorage.getItem(SELECTION_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Persist the selection (no-op if storage is unavailable). */
export function storeSelection(ids: string[]): void {
  try {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore — private mode / blocked storage */
  }
}
```

Note `selectedEvents` calls `.sort()` on the array returned by `.filter()`, which is already a fresh array — the input is never mutated. This matches `sortEvents` in `lib/filters.ts:118`, which copies with `[...events]` first for the same reason.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd site && npm test -- selection
```

Expected: PASS — 12 tests across 3 describe blocks.

- [ ] **Step 5: Typecheck**

```bash
cd site && npm run typecheck
```

Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/selection.ts site/src/lib/selection.test.ts
git commit -m "feat(site): pure selection logic for itinerary export"
```

---

### Task 2: Selection hook, card checkboxes, and the export bar

This is the smallest slice that produces working software: pick events on the card views, see the bar, export the `.ics`.

**Files:**
- Create: `site/src/lib/useSelection.ts`
- Create: `site/src/components/SelectionBar.tsx`
- Modify: `site/src/components/EventCard.tsx` (props at :16-20, media block at :36-50, article class at :36)
- Modify: `site/src/components/views/GroupedView.tsx` (props at :7-11, EventCard render at :50)
- Modify: `site/src/components/EventsExplorer.tsx` (imports at :1-16, body at :41-104)
- Modify: `site/src/index.css` (append a new section)

**Interfaces:**
- Consumes: `getStoredSelection`, `storeSelection`, `pruneSelection`, `selectedEvents` from Task 1; `downloadIcs(events, filename, calendarName?)` from `site/src/lib/ics.ts:128`.
- Produces:
  - `useSelection(events: TriangleEvent[]): Selection`
  - `interface Selection { ids: string[]; count: number; isSelected: (id: string) => boolean; toggle: (id: string) => void; clear: () => void }`
  - `EventCard` props gain required `selected: boolean` and `onToggle: (id: string) => void`
  - `GroupedView` props gain required `isSelected: (id: string) => boolean` and `onToggle: (id: string) => void`

- [ ] **Step 1: Write the selection hook**

There is no test for this file — `useTheme.ts` has no test file either, for the same reason (no DOM in the Vitest environment). Its logic is thin; the tested `pruneSelection`/`storeSelection` do the real work.

Create `site/src/lib/useSelection.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TriangleEvent } from "../types";
import { getStoredSelection, pruneSelection, storeSelection } from "./selection";

export interface Selection {
  ids: string[];
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
}

/**
 * Owns the hand-picked event set and mirrors it into localStorage. Ids left over
 * from events a weekly refresh has dropped are pruned once the event list is
 * known, so the count never overstates what will actually export.
 */
export function useSelection(events: TriangleEvent[]): Selection {
  const [ids, setIds] = useState<string[]>(getStoredSelection);

  useEffect(() => {
    // Guard on empty: an empty event list means "not loaded" or "load failed",
    // and pruning against it would silently wipe a valid stored selection.
    if (events.length === 0) return;
    setIds((prev) => {
      const pruned = pruneSelection(prev, events);
      if (pruned.length === prev.length) return prev;
      storeSelection(pruned);
      return pruned;
    });
  }, [events]);

  const picked = useMemo(() => new Set(ids), [ids]);
  const isSelected = useCallback((id: string) => picked.has(id), [picked]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      storeSelection(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
    storeSelection([]);
  }, []);

  return { ids, count: ids.length, isSelected, toggle, clear };
}
```

- [ ] **Step 2: Write the SelectionBar component**

Create `site/src/components/SelectionBar.tsx`:

```tsx
import type { TriangleEvent } from "../types";
import { downloadIcs } from "../lib/ics";
import { selectedEvents } from "../lib/selection";

interface Props {
  events: TriangleEvent[];
  ids: string[];
  onClear: () => void;
}

/**
 * Bottom bar for the hand-picked set, rendered only when something is picked.
 * The count is deliberately independent of the active filters — a pick hidden by
 * a filter still exports, so the bar has to keep reporting it.
 */
export default function SelectionBar({ events, ids, onClear }: Props) {
  const picked = selectedEvents(events, ids);
  if (picked.length === 0) return null;

  return (
    <div className="selection-bar" role="region" aria-label="Selected events">
      <div className="container selection-bar-inner">
        <div className="selection-count">
          <strong>{picked.length}</strong> event{picked.length === 1 ? "" : "s"} selected
        </div>
        <div className="selection-actions">
          <button className="btn" onClick={onClear}>
            Clear
          </button>
          <button
            className="btn btn-primary"
            onClick={() => downloadIcs(picked, "triangle-weekend-itinerary", "Triangle Weekend — My Itinerary")}
          >
            ⬇ Export itinerary .ics
          </button>
        </div>
      </div>
    </div>
  );
}
```

Deriving `picked` from `ids` rather than trusting `ids.length` also covers the first render after a refresh, before the prune effect has run — a stale id contributes to `ids` but not to `picked`, so the bar never shows a count the export cannot honour.

- [ ] **Step 3: Add the checkbox to EventCard**

In `site/src/components/EventCard.tsx`, replace the `Props` interface (currently lines 16-20):

```tsx
interface Props {
  ev: TriangleEvent;
  origin: Origin;
  showDay?: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
}
```

Replace the component signature on line 22:

```tsx
export default function EventCard({ ev, origin, selected, onToggle }: Props) {
```

Replace the opening `<article>` tag on line 36:

```tsx
<article className={`event-card cat-${fam}${selected ? " is-selected" : ""}`}>
```

Add the checkbox as the last child of the `.media` div — immediately after the `{priceBadge && ...}` line (currently line 49) and before the closing `</div>` on line 50:

```tsx
        <label className="pick" title="Add to your itinerary">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(ev.id)}
            aria-label={`Select ${ev.name}`}
          />
        </label>
```

The `<label>` wrapper gives the checkbox a large tap target; `aria-label` names it, since there is no visible label text next to it.

- [ ] **Step 4: Thread the props through GroupedView**

In `site/src/components/views/GroupedView.tsx`, replace the `Props` interface (currently lines 7-11):

```tsx
interface Props {
  events: TriangleEvent[];
  origin: Origin;
  groupBy: GroupBy;
  isSelected: (id: string) => boolean;
  onToggle: (id: string) => void;
}
```

Replace the component signature on line 25:

```tsx
export default function GroupedView({ events, origin, groupBy, isSelected, onToggle }: Props) {
```

Replace the `EventCard` render on line 50:

```tsx
                <EventCard
                  key={ev.id}
                  ev={ev}
                  origin={origin}
                  showDay={groupBy !== "day"}
                  selected={isSelected(ev.id)}
                  onToggle={onToggle}
                />
```

- [ ] **Step 5: Wire it up in EventsExplorer**

In `site/src/components/EventsExplorer.tsx`, add two imports after the existing `import { downloadIcs } from "../lib/ics";` on line 13:

```tsx
import { useSelection } from "../lib/useSelection";
import SelectionBar from "./SelectionBar";
```

Add the hook call after `const [view, setView] = useState<ViewKey>("day");` (line 31):

```tsx
  const selection = useSelection(events);
```

Replace the opening tag of the results container (line 54) so the page reserves room for the fixed bar:

```tsx
      <div className={`container section-pad${selection.count > 0 ? " has-selection-bar" : ""}`}>
```

Replace the `GroupedView` render (line 100):

```tsx
          <GroupedView
            events={visible}
            origin={origin}
            groupBy={view}
            isSelected={selection.isSelected}
            onToggle={selection.toggle}
          />
```

Add the bar immediately after the closing `</div>` of that container (line 102), before the closing `</>`:

```tsx
      <SelectionBar events={events} ids={selection.ids} onClear={selection.clear} />
```

Pass `events` — not `visible` — so filtered-out picks still export.

- [ ] **Step 6: Add the CSS**

Append to `site/src/index.css`:

```css
/* ---------- Hand-picked selection + itinerary export ---------- */
.event-card .media .pick {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--pill);
  background: var(--badge-bg);
  cursor: pointer;
}
.event-card .media .pick input {
  width: 17px;
  height: 17px;
  accent-color: var(--green);
  cursor: pointer;
  margin: 0;
}
.event-card.is-selected {
  box-shadow: 0 0 0 2px var(--green);
}

.selection-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 500;
  background: var(--card);
  border-top: 1px solid var(--line);
  box-shadow: var(--shadow-md);
  padding: 12px 0;
}
.selection-bar-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}
.selection-count {
  color: var(--ink-2);
  font-size: 13.5px;
}
.selection-count strong {
  color: var(--ink);
}
.selection-actions {
  display: flex;
  gap: 8px;
}
/* Keep the fixed bar from covering the last row of results. */
.has-selection-bar {
  padding-bottom: 96px;
}
```

`z-index: 500` sits above the Leaflet map panes (Leaflet's controls top out at 1000 for popups but its tile/overlay panes are 200-400), so the bar stays visible in Map view.

- [ ] **Step 7: Run the full site suite and typecheck**

```bash
cd site && npm test && npm run typecheck
```

Expected: all tests PASS (the Task 1 selection tests plus the pre-existing `filters`, `format`, `distance`, `theme`, `ics` suites); typecheck exits 0 with no output.

If typecheck reports a missing `selected`/`onToggle` prop on `EventCard`, a caller was missed — `GroupedView` is the only one (verified by `grep -rn "EventCard" site/src`).

- [ ] **Step 8: Build**

```bash
cd site && npm run build
```

Expected: exit 0, writes to `../public`.

- [ ] **Step 9: Commit**

```bash
git add site/src/lib/useSelection.ts site/src/components/SelectionBar.tsx \
        site/src/components/EventCard.tsx site/src/components/views/GroupedView.tsx \
        site/src/components/EventsExplorer.tsx site/src/index.css
git commit -m "feat(site): pick events on cards and export them as one .ics"
```

---

### Task 3: Table view checkbox column

**Files:**
- Modify: `site/src/components/views/TableView.tsx` (props at :6-9, signature at :11, `<thead>` at :19-29, `<tr>` body at :37-41)
- Modify: `site/src/components/EventsExplorer.tsx` (TableView render at :88)
- Modify: `site/src/index.css` (append to the section added in Task 2)

**Interfaces:**
- Consumes: `isSelected` and `onToggle` from the `Selection` object produced in Task 2.
- Produces: `TableView` props gain required `isSelected: (id: string) => boolean` and `onToggle: (id: string) => void`.

- [ ] **Step 1: Add the props to TableView**

In `site/src/components/views/TableView.tsx`, replace the `Props` interface (currently lines 6-9):

```tsx
interface Props {
  events: TriangleEvent[];
  origin: Origin;
  isSelected: (id: string) => boolean;
  onToggle: (id: string) => void;
}
```

Replace the component signature on line 11:

```tsx
export default function TableView({ events, origin, isSelected, onToggle }: Props) {
```

- [ ] **Step 2: Add the header cell**

Add as the first child of the `<tr>` inside `<thead>` (before `<th>Event</th>` on line 21):

```tsx
              <th className="pick-col">
                <span className="sr-only">Selected</span>
              </th>
```

- [ ] **Step 3: Add the body cell**

Inside the `<tr>` returned per event, add as the first child (before the `<td>` containing `.nm` on line 38):

```tsx
                  <td className="pick-col">
                    <input
                      type="checkbox"
                      checked={isSelected(ev.id)}
                      onChange={() => onToggle(ev.id)}
                      aria-label={`Select ${ev.name}`}
                    />
                  </td>
```

Also mark the selected row so it reads at a glance — replace the `<tr>` opening tag on line 37:

```tsx
                <tr
                  key={ev.id}
                  className={`cat-${categoryFamily(ev.category)}${isSelected(ev.id) ? " is-selected" : ""}`}
                >
```

- [ ] **Step 4: Pass the props from EventsExplorer**

In `site/src/components/EventsExplorer.tsx`, replace the `TableView` render (line 88):

```tsx
          <TableView
            events={visible}
            origin={origin}
            isSelected={selection.isSelected}
            onToggle={selection.toggle}
          />
```

- [ ] **Step 5: Add the CSS**

Append to the selection section of `site/src/index.css`:

```css
.events th.pick-col,
.events td.pick-col {
  width: 34px;
  padding-right: 0;
  text-align: center;
}
.events td.pick-col input {
  width: 16px;
  height: 16px;
  accent-color: var(--green);
  cursor: pointer;
  margin: 0;
}
.events tr.is-selected {
  background: var(--line-soft);
}
/* Visually hidden but announced — for the checkbox column header. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

Before adding `.sr-only`, check it does not already exist:

```bash
grep -n "sr-only" site/src/index.css
```

If it already exists, omit that block rather than duplicating it.

- [ ] **Step 6: Run tests, typecheck, and build**

```bash
cd site && npm test && npm run typecheck && npm run build
```

Expected: all PASS, typecheck and build exit 0.

- [ ] **Step 7: Commit**

```bash
git add site/src/components/views/TableView.tsx site/src/components/EventsExplorer.tsx site/src/index.css
git commit -m "feat(site): pick events from the table view"
```

---

### Task 4: End-to-end verification against the acceptance criteria

No code is expected in this task. If a criterion fails, fix it and re-run the gates from Task 3 Step 6 before committing.

**Files:**
- Modify: only as needed to fix a failing criterion.

- [ ] **Step 1: Confirm the repo-root suite still passes**

The root suite covers `scripts/` (dedup, validate, build_ics), none of which this change touches — this is a regression check.

```bash
cd /Users/cory/DooHub/.claude/worktrees/thirsty-antonelli-9723fb && npm test
```

Expected: PASS. Record the actual counts (e.g. "48 passing, 0 failing") rather than reporting "tests pass".

- [ ] **Step 2: Start the dev server**

Use the `preview_start` tool (never `Bash` for dev servers). If `.claude/launch.json` does not exist, create it:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "site",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev", "--prefix", "site"],
      "port": 5173
    }
  ]
}
```

- [ ] **Step 3: Walk the acceptance criteria in the browser**

Check each one and note the result:

1. Ticking a checkbox on a card raises the selection count and the bar appears.
2. The same event ticked in the table shows as ticked on its card, and vice versa (switch views via the view toggle and confirm).
3. Reloading the page preserves the selection.
4. Changing a filter does not change the selection count. Pick an event, then filter to a day that excludes it — the count must not drop.
5. `Export itinerary .ics` downloads a file whose VEVENTs are exactly the picked events, in chronological order.
6. `Clear` empties the selection and hides the bar.
7. A stale id is dropped on load: with a selection saved, run
   `localStorage.setItem("tw:selection", JSON.stringify([...JSON.parse(localStorage.getItem("tw:selection")), "does-not-exist"]))`
   via the `javascript_tool`, reload, and confirm the count is unchanged.
8. The fixed bar does not cover the last row of results, and remains visible in Map view.

- [ ] **Step 4: Check the console and confirm the export**

Use `read_console_messages` — expected: no errors. Verify the downloaded `.ics` contains one `BEGIN:VEVENT` per picked event, `X-WR-CALNAME:Triangle Weekend — My Itinerary`, and `DTSTART` values in ascending order.

- [ ] **Step 5: Screenshot for the PR**

Take a screenshot showing several picked cards and the bar, for the PR description.

- [ ] **Step 6: Open the PR**

Per the repo's workflow rules: branch is `claude/event-checkboxes-ics-export-152503`, never push to `main`.

```bash
git push -u origin claude/event-checkboxes-ics-export-152503
gh pr create --title "feat(site): pick events and export them as one itinerary .ics" --body "$(cat <<'EOF'
## Summary
Adds checkboxes to the event cards and the table view, and a bottom bar that
exports the hand-picked set as a single `.ics`.

Selections persist in `localStorage` and are pruned against the current
`events.json` on load, so ids left behind by a weekly refresh disappear.
Selection is independent of the active filters — a pick hidden by a filter
still exports.

## Test plan
- `site/src/lib/selection.test.ts` covers parse / prune / chronological ordering
- `npm test`, `npm run typecheck`, `npm run build` in `site/`
- Root `npm test` for regressions
- Browser-verified against the acceptance criteria in the plan

Spec: `docs/superpowers/specs/2026-07-18-event-selection-ics-design.md`
Plan: `docs/superpowers/plans/2026-07-18-event-selection-ics.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Do **not** enable auto-merge.
