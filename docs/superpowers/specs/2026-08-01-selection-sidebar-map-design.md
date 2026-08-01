# Selection sidebar + selection-aware map

**Date:** 2026-08-01
**Status:** Approved, ready for implementation

## Problem

Selection already exists (see `2026-07-18-event-selection-ics-design.md`): every
card and table row has a checkbox, picks persist in `localStorage`, and the set
exports as one `.ics`. But the only feedback the user gets is a count — a fixed
bottom bar reading "4 events selected". They cannot see *which* four, cannot
remove one without hunting its card down in the grid, and the map view is
entirely unaware that a selection exists.

The selection is meant to be an itinerary. An itinerary you can't see or place
on a map isn't doing its job.

## Scope

In scope:

- A docked sidebar listing the picked events in chronological order, with a
  running summary, per-row remove, and the Clear / Export actions moved into it.
- Sidebar rows cross-highlight with the map: click to focus a marker, hover to
  pulse it.
- The map distinguishes picked from unpicked markers, numbers the picks in
  chronological order, and auto-fits its viewport to the selection.
- A mobile layout where the sidebar collapses to the existing bottom bar and
  expands into a bottom sheet.

Out of scope (deliberate):

- Reordering the selection by hand. Chronological order is the itinerary order.
- A route polyline between picks, or any drive-time / travel-leg computation
  between selected events.
- Conflict or overlap detection between picks.
- Checkboxes inside map popups (still deliberately excluded, per the prior spec).
- Sharing a selection by URL.
- Any change to `scripts/lib/ics.ts` or the published `public/events.ics`.

## Design

### 1. Pure logic (new, unit-tested)

The project has no jsdom or testing-library and deliberately keeps it that way
(see the header comment in `lib/selection.ts`). So all new derivable logic lands
in pure modules that Vitest can exercise without a DOM; component behavior is
verified in the browser.

`site/src/lib/selectionSummary.ts`

| Function | Behavior |
|---|---|
| `parsePrice(price: string): { min: number; max: number } \| null` | `"Free"`/`"free"` → `{min:0,max:0}`. `"$15"` → `{min:15,max:15}`. `"$10-$25"`, `"$10 – $25"` (en/em dash) → `{min:10,max:25}`. `"unknown"`, `""`, and anything with no parseable dollar figure → `null`. Amounts with thousands separators or decimals (`"$1,200"`, `"$12.50"`) parse. |
| `summarizeSelection(picked: TriangleEvent[]): SelectionSummary` | Returns `{ count, daySpan, costRange }`. |

`SelectionSummary` fields:

- `count` — number of picked events.
- `daySpan` — `"Sat"` for a single day, `"Fri–Sun"` across a span. Weekday
  labels come from the existing `formatWeekdayShort`, so timezone handling stays
  consistent with the rest of the app. Empty string when `count === 0`.
- `costRange` — `"Free"` when every parseable price is 0; `"$30"` when the min
  and max coincide; `"$30–$65"` otherwise. Events whose price does not parse are
  **excluded from the range and the string is suffixed `+`** (e.g. `"$30–$65+"`)
  so the figure never silently understates the real cost. Empty string when no
  price in the selection parses at all.

`site/src/lib/mapMarkers.ts`

| Function | Behavior |
|---|---|
| `mergeForMap(visible: TriangleEvent[], picked: TriangleEvent[]): TriangleEvent[]` | Union of the two lists, deduplicated by `id`, preserving `visible` order first then appending picks not already present. |
| `boundsFor(events: TriangleEvent[]): Bounds \| null` | Bounding box `[[south, west], [north, east]]` over events with numeric `lat`/`lon`. `null` when none have coordinates. |
| `boundsKey(b: Bounds \| null): string` | Stable string signature of a bounds, so a React effect can depend on the *value* rather than the array identity and refit only when the box actually changes. |

**Filter independence.** `mergeForMap` means a picked event that the current
filters hide still plots on the map. This is intentional and matches the rule
already established for the selection count: the selection is deliberately
independent of the active filters, so narrowing a filter must not silently drop
pins out of the user's itinerary.

### 2. `SelectionSidebar.tsx` (new; replaces `SelectionBar.tsx`)

`SelectionBar.tsx` is deleted. Its count, Clear, and Export actions move into the
sidebar header, which doubles as the collapsed mobile handle. One component
serves both layouts so the two can't drift apart.

Props: `{ events, ids, focusedId, hoveredId, onToggle, onClear, onFocus, onHover }`.

Structure:

- **Header** — "Your itinerary", the summary line (`4 events · Fri–Sun · $30–$65`),
  a Clear button, and the Export `.ics` button (same `downloadIcs` call and
  filename as the bar it replaces, so the export is unchanged).
- **List** — `selectedEvents(events, ids)` order. Each row: a numbered badge
  matching the map marker, the event name, `formatWeekdayShort` + `formatClock24`,
  the city, and an `×` button calling `onToggle(id)` to unpick.
- **Interaction** — row `onClick` → `onFocus(id)`; `onMouseEnter`/`onMouseLeave`
  → `onHover(id | null)`. The `×` is a sibling button, not nested inside the
  focus button, so removing can't also focus a marker that is about to vanish.
  Because the row's affordance reads "show on map", `onFocus` **also switches
  the view to Map** — otherwise clicking a row while browsing cards would do
  nothing visible.
- **Visibility** — renders `null` at zero picks, matching the current bar.

Which layout is active is read in React via a new `lib/useMediaQuery.ts`, not
inferred from CSS alone: only the compact layout's header is an expand control,
and rendering `aria-expanded` on the docked one would lie to screen readers. The
hook listens to both the media query's `change` event and `window.resize` — if
the query event is ever missed, React's idea of the layout desyncs from the
CSS's and the sheet's header stops being the button that opens it.

Accessibility: the panel keeps the existing `role="region"` /
`aria-label="Selected events"`. Rows are `<li>` elements whose focus action is a
real `<button>`, so the cross-highlight is keyboard reachable; hover-pulse is a
progressive enhancement only.

### 3. `EventsExplorer` — layout and shared state

Results and sidebar move into an `.explorer-layout` grid. At ≥901px the grid is
`1fr` normally and `1fr 320px` once something is picked, so both the card grid
and the map reflow narrower rather than being overlapped.

Two new pieces of state live here, the lowest common ancestor of the sidebar and
the map:

- `focusedId: string | null` — set by a sidebar row click, consumed by the map.
- `hoveredId: string | null` — set by row hover, consumed by the map.

Both reset to `null` when the selection is cleared.

### 4. `MapView` — selection awareness

New props: `selectedIds: string[]`, `focusedId`, `hoveredId`.

- **Rendering.** The map draws `mergeForMap(events, picked)`. Picked events
  render as `L.divIcon` markers carrying their chronological number — a
  `CircleMarker` cannot hold text, so numbering requires a `Marker`. Unpicked
  events stay `CircleMarker`s but drop to ~0.45 fill opacity and a smaller
  radius, so the picks read as foreground. With no selection, every marker keeps
  today's appearance exactly.
- **Fit bounds.** A `<FitBounds>` child component using `useMap()` calls
  `fitBounds(boundsFor(picked), { padding })` in an effect keyed on
  `boundsKey(...)`, so it refits only when the selection's box actually changes
  rather than on every render. A single pick fits to a degenerate box, so that
  case uses `setView(center, 13)` instead.
- **Focus.** Marker instances are collected into a `Map<string, Layer>` ref. On
  `focusedId` change the map calls `flyTo` on that marker's position and
  `openPopup()` on the marker.
- **Hover.** The hovered marker's radius / icon class is bumped for a pulse.
- **Container resize.** The sidebar appearing or disappearing changes the map
  container's width, and Leaflet does not observe that on its own, so tiles and
  marker positions would render against the stale width. Handled with a
  `ResizeObserver` on the map container rather than a selection-transition
  signal — same intent, but it also covers window resizes and view switches.

Three constraints found while building this; all are load-bearing and commented
at their call sites:

- `fitBounds` must pass `animate: false`. An animated fit issued on mount is
  interrupted by the map's own `invalidateSize` and silently leaves the viewport
  where it was.
- The fit runs on a `setTimeout(0)` and calls `invalidateSize()` first, so it
  measures the container *after* the grid has reflowed around the sidebar.
- `<FocusMarker>` must be the **last** child of `<MapContainer>`. React runs
  effects in tree order and react-leaflet's `<Popup>` binds itself to its parent
  layer from its own effect; placed earlier, the first focus (the click that
  also mounts the map) calls `openPopup()` before any popup exists.

### 5. Styling

New CSS in `index.css` follows the existing token vocabulary (`--card`,
`--line`, `--green`, `--mono`). The `.selection-bar` rules are replaced by
`.selection-sidebar` rules; `.has-selection-bar`'s bottom padding is retained
but scoped to the mobile layout, where the collapsed handle is still fixed to
the bottom of the viewport.

At ≤900px the sidebar becomes a fixed bottom sheet: the header alone is visible
(reproducing today's bottom bar), and tapping it toggles an `is-open` class that
reveals the scrollable list. The breakpoint is new; the existing 720px and 640px
breakpoints are untouched.

## Testing

Unit (Vitest, no DOM):

- `selectionSummary.test.ts` — `parsePrice` across Free / single / range /
  en-dash / decimal / thousands / unknown / empty / junk. `summarizeSelection`
  for zero, one, and many picks; single-day vs multi-day span; all-free
  selection; mixed parseable and unparseable prices producing the `+` suffix;
  no-parseable-price selection producing an empty `costRange`.
- `mapMarkers.test.ts` — `mergeForMap` union, dedup by id, order, and the
  filtered-out-pick case. `boundsFor` with no coords → `null`, with partial
  coords, and the correct bbox. `boundsKey` stability across equal-valued
  arrays.

The full existing suite must stay green.

Browser (dev server via the preview tools):

- Docked layout at desktop width; grid and map reflow, no horizontal overflow.
- Bottom sheet at ≤900px; collapsed handle matches the old bar; tap expands.
- Row click focuses and opens the right marker's popup; row hover pulses it.
- Map fits to the selection; picked markers numbered and matching the sidebar.
- A pick hidden by an active filter still plots.
- Map redraws correctly when the sidebar appears (no stale-width tiles).
- Dark mode; no console errors.

## Acceptance criteria

1. Selecting an event shows it by name in a sidebar, in chronological order.
2. The sidebar summarizes count, day span, and cost range.
3. Removing an event from the sidebar unpicks it everywhere.
4. Clicking a sidebar row focuses that event's marker on the map.
5. Hovering a sidebar row highlights its marker.
6. The map visually distinguishes picked from unpicked events and numbers the
   picks to match the sidebar.
7. The map viewport fits the selection when it changes.
8. Picked events hidden by the active filters still appear on the map.
9. At mobile widths the sidebar collapses to the previous bottom-bar behavior.
10. Export and Clear behave exactly as they did in `SelectionBar`.
11. `npm run test`, `npm run typecheck`, and `npm run build` all pass.
