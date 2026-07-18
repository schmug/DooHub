# Event selection → itinerary .ics export

**Date:** 2026-07-18
**Status:** Approved, ready for implementation plan

## Problem

The site can export *all* events or *filtered* events as `.ics`, and each card can
export itself. There is no way to hand-pick an arbitrary set of events across
different days, cities, and filter states and export exactly that set as one
calendar file. That hand-picked set is what a user actually plans a weekend
around.

## Scope

In scope:

- A checkbox on each event in the grouped (day/city/category) card views and in
  the table view.
- Selections persist across page reloads via `localStorage`.
- A sticky bottom bar showing the selection count with export and clear actions.
- Export of the picked events as a single `.ics`.

Out of scope (deliberate):

- Checkboxes in Leaflet map popups. The map is a lookup surface and the popup is
  already cramped.
- Conflict detection, drive-time gap analysis, or overlap warnings between picks.
- Naming an itinerary, or wrapping the picks in a summary VEVENT. The export is a
  plain set of the picked VEVENTs.
- Sharing a selection by URL.
- Any change to `scripts/lib/ics.ts` (the server build) or to the published
  `public/events.ics`.

## Design

### 1. State layer

Two files, mirroring the existing `lib/theme.ts` + `lib/useTheme.ts` split
(pure logic separate from the React binding, so the logic is unit-testable
without a DOM testing library — the project has none).

`site/src/lib/selection.ts` — pure functions:

| Function | Behavior |
|---|---|
| `loadSelection(): string[]` | Reads the `tw:selection` localStorage key. Returns `[]` when the key is missing, the JSON is corrupt, or the parsed value is not an array of strings. |
| `saveSelection(ids: string[]): void` | Writes the ids as JSON. Silently no-ops if localStorage throws (private browsing, quota). |
| `pruneSelection(ids: string[], events: TriangleEvent[]): string[]` | Returns only the ids present in `events`. |
| `selectedEvents(events: TriangleEvent[], ids: string[]): TriangleEvent[]` | Returns the events whose ids are in `ids`, **sorted ascending by `start`**. Unknown ids are ignored. |

`pruneSelection` runs once on mount and the pruned result is written back.
`data/events.json` refreshes weekly and drops past events; without pruning the
stored id list would grow without bound and the count in the selection bar would
overstate what actually exports.

`site/src/lib/useSelection.ts` — a hook holding a `Set<string>`, exposing
`{ isSelected(id), toggle(id), clear(), count }`, persisting via `saveSelection`
on every mutation.

### 2. Wiring

`EventsExplorer` owns `useSelection` and threads `isSelected` and `toggle` down
as props: two levels to `EventCard` (through `GroupedView`), one level to
`TableView`.

*Alternative considered and rejected:* React context. With only two consumer
components at a maximum depth of two, context adds indirection without removing
meaningful prop threading, and it makes both components harder to render in
isolation.

### 3. UI

- **`EventCard`** — a checkbox in the media corner, wrapped in a `<label>` with
  an accessible name (e.g. `Select {event name}`) so it is reachable by keyboard
  and announced by screen readers. The `<article>` gains an `is-selected` class
  driving a visible ring.
- **`TableView`** — a leading checkbox column with a `<th>` header.
- **`SelectionBar.tsx`** (new) — a bottom bar rendered only when `count > 0`,
  showing `N selected`, an `⬇ Export itinerary .ics` button, and a `Clear`
  button.

### 4. Selection is independent of filters

If the user picks three events and then narrows the filter to Saturday only, the
bar still reports three and the export still contains all three. Intersecting the
selection with the active filter would silently drop picks from the export, which
is the worse failure — the user would get a calendar file missing events they
explicitly ticked.

The existing "Filtered .ics" and "All events .ics" buttons are unchanged.

### 5. Export

Reuses `downloadIcs` from `site/src/lib/ics.ts` with no modification to that
module. Filename `triangle-weekend-itinerary`, calendar name
`Triangle Weekend — My Itinerary`. Because the export path is unchanged, each
exported VEVENT remains byte-identical to the same event in the published
`events.ics`, including the stable `UID`.

## Testing

Written test-first. All new logic lives in pure functions, so the suite runs
under the existing Vitest setup with no new dependencies.

`site/src/lib/selection.test.ts`:

- `loadSelection` returns `[]` when the key is absent.
- `loadSelection` returns `[]` when the stored value is corrupt JSON.
- `loadSelection` returns `[]` when the stored JSON is valid but not an array.
- `saveSelection` → `loadSelection` round-trips an id list.
- `pruneSelection` drops ids absent from the event list.
- `pruneSelection` keeps ids present in the event list.
- `selectedEvents` returns picks sorted ascending by `start` given an unordered
  id list.
- `selectedEvents` ignores ids with no matching event.

Existing `site/src/lib/ics.test.ts` already covers `buildIcs`; no changes there.

## Acceptance criteria

1. Ticking a checkbox on a card or a table row raises the selection count.
2. The same event ticked in the table shows as ticked on its card, and vice
   versa.
3. Reloading the page preserves the selection.
4. Changing filters does not change the selection count or the export contents.
5. `Export itinerary .ics` downloads a file whose VEVENTs are exactly the picked
   events, in chronological order.
6. `Clear` empties the selection and hides the bar.
7. An id in localStorage that no longer exists in `events.json` is dropped on
   load and does not appear in the count.
8. Gates pass: `npm test`, `npm run typecheck`, and `npm run build` in `site/`,
   plus `npm test` at the repo root.
