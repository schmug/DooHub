import { lazy, Suspense, useMemo, useState } from "react";
import type { Origin, TriangleEvent } from "../types";
import type { Theme } from "../lib/theme";
import {
  applyFilters,
  emptyFilters,
  sortEvents,
  uniqueCategories,
  uniqueDays,
  type FilterState,
  type SortKey,
} from "../lib/filters";
import { downloadIcs } from "../lib/ics";
import { useSelection } from "../lib/useSelection";
import SelectionBar from "./SelectionBar";
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

export default function EventsExplorer({ events, origin, theme }: Props) {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [sort, setSort] = useState<SortKey>("date");
  const [view, setView] = useState<ViewKey>("day");
  const selection = useSelection(events);

  const days = useMemo(() => uniqueDays(events), [events]);
  const categories = useMemo(() => uniqueCategories(events), [events]);

  const visible = useMemo(() => {
    const filtered = applyFilters(events, filters, origin);
    return sortEvents(filtered, sort, origin);
  }, [events, filters, sort, origin]);

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        sort={sort}
        setSort={setSort}
        view={view}
        setView={setView}
        days={days}
        categories={categories}
      />

      <div className={`container section-pad${selection.count > 0 ? " has-selection-bar" : ""}`}>
        <div className="results-bar">
          <div className="results-count">
            <strong>{visible.length}</strong> of {events.length} events
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

        {visible.length === 0 ? (
          <div className="empty">
            <div className="empty-mark" aria-hidden>
              △
            </div>
            <h3>No events match these filters</h3>
            <p>Try clearing a filter or widening the distance band.</p>
            <button className="btn btn-primary" onClick={() => setFilters(emptyFilters)}>
              Clear all filters
            </button>
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
            <MapView events={visible} origin={origin} theme={theme} />
          </Suspense>
        ) : (
          <GroupedView
            events={visible}
            origin={origin}
            groupBy={view}
            isSelected={selection.isSelected}
            onToggle={selection.toggle}
          />
        )}
      </div>
      <SelectionBar events={events} ids={selection.ids} onClear={selection.clear} />
    </>
  );
}
