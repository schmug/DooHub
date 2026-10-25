import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import type { Origin, TriangleEvent } from "../types";
import type { Theme } from "../lib/theme";
import {
  applyFilters,
  cityOptions,
  emptyFilters,
  sortEvents,
  uniqueCategories,
  uniqueDays,
  type FilterState,
  type SortKey,
} from "../lib/filters";
import { downloadIcs } from "../lib/ics";
import { isOver } from "../lib/past";
import { useNow } from "../lib/useNow";
import { selectedEvents } from "../lib/selection";
import { useSelection } from "../lib/useSelection";
import SelectionSidebar from "./SelectionSidebar";
import FilterBar, { type ViewKey } from "./FilterBar";
import GroupedView from "./views/GroupedView";
import TableView from "./views/TableView";

// MapView pulls in Leaflet (~140 KB). Code-split it so the initial bundle stays
// lean — the chunk only loads when the user opens the Map view.
const MapView = lazy(() => import("./views/MapView"));

interface Props {
  events: TriangleEvent[];
  origin: Origin;
  theme: Theme;
}

/** A focus request. The counter lets re-clicking the same row re-focus it. */
interface Focus {
  id: string;
  n: number;
}

export default function EventsExplorer({ events, origin, theme }: Props) {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [sort, setSort] = useState<SortKey>("date");
  const [view, setView] = useState<ViewKey>("day");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [stackRepeats, setStackRepeats] = useState(true);
  const selection = useSelection(events);
  const now = useNow();

  // Finished events drop out before any filter runs, so day chips and counts
  // only offer what's still ahead. The week's store keeps days already gone.
  const upcoming = useMemo(() => events.filter((ev) => !isOver(ev, now)), [events, now]);
  const pastCount = events.length - upcoming.length;
  const pool = showPast ? events : upcoming;

  const days = useMemo(() => uniqueDays(pool), [pool]);
  const categories = useMemo(() => uniqueCategories(events), [events]);
  const cities = useMemo(() => cityOptions(events), [events]);

  // A day chip left set for a day that has since passed would otherwise
  // silently match nothing.
  const activeFilters = useMemo(
    () => (filters.days.some((d) => !days.includes(d)) ? { ...filters, days: filters.days.filter((d) => days.includes(d)) } : filters),
    [filters, days],
  );

  const visible = useMemo(() => {
    const filtered = applyFilters(pool, activeFilters, origin);
    return sortEvents(filtered, sort, origin);
  }, [pool, activeFilters, sort, origin]);

  // Chronological, and drawn from the full event set rather than `visible` —
  // the selection is deliberately independent of the active filters.
  const picked = useMemo(() => selectedEvents(events, selection.ids), [events, selection.ids]);
  const hasSelection = picked.length > 0;

  const { clear } = selection;
  const clearSelection = useCallback(() => {
    clear();
    setFocus(null);
    setHoveredId(null);
  }, [clear]);

  // The row says "show on map", so honor that from any view rather than leaving
  // a dead affordance when the user is browsing cards.
  const focusEvent = useCallback((id: string) => {
    setView("map");
    setFocus((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
  }, []);

  return (
    <>
      <FilterBar
        filters={activeFilters}
        setFilters={setFilters}
        sort={sort}
        setSort={setSort}
        view={view}
        setView={setView}
        days={days}
        categories={categories}
        cities={cities}
      />

      <div className={`container section-pad${hasSelection ? " has-selection" : ""}`}>
        <div className="results-bar">
          <div className="results-count">
            <strong>{visible.length}</strong> of {pool.length} {showPast ? "events" : "upcoming events"}
          </div>
          <div className="results-toggles">
            {pastCount > 0 && (
              <label className="results-toggle">
                <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
                Show {pastCount} past
              </label>
            )}
            {(view === "day" || view === "city" || view === "category") && (
              <label className="results-toggle">
                <input type="checkbox" checked={stackRepeats} onChange={(e) => setStackRepeats(e.target.checked)} />
                Stack repeats
              </label>
            )}
          </div>
          <div className="export-group">
            <button
              className="btn"
              disabled={visible.length === 0}
              onClick={() => downloadIcs(visible, "triangle-weekend-filtered", "Triangle Weekend (filtered)")}
            >
              ⬇ Filtered .ics
            </button>
            <button
              className="btn"
              onClick={() => downloadIcs(events, "triangle-weekend-all", "Triangle Weekend — All Events")}
            >
              ⬇ All events .ics
            </button>
          </div>
        </div>

        <div className={`explorer-layout${hasSelection ? " with-sidebar" : ""}`}>
          <div className="explorer-main">
            {visible.length === 0 ? (
              <div className="empty">
                <div className="empty-mark" aria-hidden>
                  △
                </div>
                {pool.length === 0 ? (
                  <>
                    <h3>Everything this week is over</h3>
                    <p>The next weekly refresh brings in new events.</p>
                  </>
                ) : (
                  <>
                    <h3>No events match these filters</h3>
                    <p>Try clearing a filter or widening the distance.</p>
                  </>
                )}
                <div className="empty-actions">
                  {pool.length > 0 && (
                    <button className="btn btn-primary" onClick={() => setFilters(emptyFilters)}>
                      Clear all filters
                    </button>
                  )}
                  {!showPast && pastCount > 0 && (
                    <button className="btn" onClick={() => setShowPast(true)}>
                      Show past events
                    </button>
                  )}
                </div>
              </div>
            ) : view === "table" ? (
              <TableView
                events={visible}
                origin={origin}
                isSelected={selection.isSelected}
                onToggle={selection.toggle}
              />
            ) : view === "map" ? (
              <Suspense
                fallback={
                  <div className="empty">
                    <h3>Loading map…</h3>
                  </div>
                }
              >
                <MapView
                  events={visible}
                  picked={picked}
                  focusedId={focus?.id ?? null}
                  focusNonce={focus?.n ?? 0}
                  hoveredId={hoveredId}
                  origin={origin}
                  theme={theme}
                />
              </Suspense>
            ) : (
              <GroupedView
                events={visible}
                origin={origin}
                groupBy={view}
                stackRepeats={stackRepeats}
                isSelected={selection.isSelected}
                onToggle={selection.toggle}
              />
            )}
          </div>

          <SelectionSidebar
            events={events}
            ids={selection.ids}
            focusedId={focus?.id ?? null}
            hoveredId={hoveredId}
            onToggle={selection.toggle}
            onClear={clearSelection}
            onFocus={focusEvent}
            onHover={setHoveredId}
          />
        </div>
      </div>
    </>
  );
}
