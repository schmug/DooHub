import { useState } from "react";
import InOutChips from "./InOutChips";
import type { Budget } from "../types";
import { driveMinutes, MAX_SLIDER_MILES, MIN_SLIDER_MILES } from "../lib/distance";
import { categoryIcon, formatDayShort } from "../lib/format";
import TimeSlider from "./TimeSlider";
import {
  activeFilterCount,
  emptyFilters,
  isFilterActive,
  SORT_OPTIONS,
  type FilterState,
  type CityOption,
  type SortKey,
} from "../lib/filters";
import { inOutState } from "../lib/inOut";

export type ViewKey = "day" | "city" | "category" | "table" | "map";

export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "day", label: "By Day" },
  { key: "city", label: "By City" },
  { key: "category", label: "By Category" },
  { key: "table", label: "Table" },
  { key: "map", label: "Map" },
];

const BUDGETS: Budget[] = ["$", "$$", "$$$", "$$$$"];

/** Cities shown before the "More cities" toggle; the long tail collapses. */
const TOP_CITIES = 8;

interface Props {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  view: ViewKey;
  setView: (v: ViewKey) => void;
  days: string[];
  categories: string[];
  cities: CityOption[];
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export default function FilterBar({ filters, setFilters, sort, setSort, view, setView, days, categories, cities }: Props) {
  const f = filters;
  const set = (patch: Partial<FilterState>) => setFilters({ ...f, ...patch });
  // Chip filters collapse behind the "Filters" toggle on every viewport so the
  // toolbar stays compact and events sit right under the search box.
  const [open, setOpen] = useState(false);
  const [allCities, setAllCities] = useState(false);
  const count = activeFilterCount(f);
  // Collapsed, show the top cities plus any tail city that is currently set, so
  // an active include/exclude never hides behind the toggle.
  const shownCities = allCities
    ? cities
    : cities.filter((c, i) => i < TOP_CITIES || inOutState(f.cities, c.key) !== "neutral");
  const hiddenCities = cities.length - shownCities.length;

  return (
    <div className="toolbar">
      <div className="container">
        <div className="toolbar-row">
          <input
            className="search-input"
            type="search"
            placeholder="⌕  Search events, venues, cities…"
            value={f.search}
            onChange={(e) => set({ search: e.target.value })}
            aria-label="Search events"
          />
          <div className="sort-group">
            <label className="control-label" htmlFor="sort">
              Sort
            </label>
            <select id="sort" className="control" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="view-switch" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button key={v.key} aria-pressed={view === v.key} onClick={() => setView(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="filters-toggle"
          aria-expanded={open}
          aria-controls="toolbar-filters"
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">⚙</span>
          {open ? "Hide filters" : "Filters"}
          {count > 0 && <span className="filters-count">{count}</span>}
        </button>

        <div id="toolbar-filters" className={"toolbar-filters" + (open ? " open" : "")}>
          {days.length > 1 && (
            <div className="chip-row">
              <span className="row-label">Day</span>
              <div className="chips">
                {days.map((d) => (
                  <button
                    key={d}
                    className="chip"
                    aria-pressed={f.days.includes(d)}
                    onClick={() => set({ days: toggle(f.days, d) })}
                  >
                    {formatDayShort(`${d}T12:00:00-04:00`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chip-row">
            <span className="row-label">Time</span>
            <TimeSlider
              range={f.timeRange}
              includeAllDay={f.includeAllDay}
              onChange={(timeRange, includeAllDay) => set({ timeRange, includeAllDay })}
            />
          </div>

          <div className="chip-row">
            <span className="row-label">Distance</span>
            <div className="distance-filter">
              <div className="distance-slider">
                <input
                  type="range"
                  min={MIN_SLIDER_MILES}
                  max={MAX_SLIDER_MILES}
                  step={1}
                  value={f.maxMiles ?? MAX_SLIDER_MILES}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    set({ maxMiles: v >= MAX_SLIDER_MILES ? null : v });
                  }}
                  aria-label="Maximum distance in miles"
                  aria-valuetext={f.maxMiles === null ? "Any distance" : `Within ${f.maxMiles} miles`}
                />
                <span className="distance-readout">
                  {f.maxMiles === null
                    ? "Any distance"
                    : `Within ${f.maxMiles} mi · ~${driveMinutes(f.maxMiles)} min`}
                </span>
              </div>
              <label className="distance-unknown">
                <input
                  type="checkbox"
                  checked={f.includeUnknownLocation}
                  disabled={f.maxMiles === null}
                  onChange={(e) => set({ includeUnknownLocation: e.target.checked })}
                />
                Include events with unknown location
              </label>
            </div>
          </div>

          <div className="chip-row">
            <span className="row-label">Price</span>
            <div className="chips">
              <button className="chip" aria-pressed={f.freeOnly} onClick={() => set({ freeOnly: !f.freeOnly })}>
                Free
              </button>
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  className="chip"
                  aria-pressed={f.budgets.includes(b)}
                  onClick={() => set({ budgets: toggle(f.budgets, b) })}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="chip-row">
            <span className="row-label">Setting</span>
            <div className="chips">
              <button
                className="chip"
                aria-pressed={f.indoorOutdoor.includes("indoor")}
                onClick={() => set({ indoorOutdoor: toggle(f.indoorOutdoor, "indoor") })}
              >
                🏠 Indoor
              </button>
              <button
                className="chip"
                aria-pressed={f.indoorOutdoor.includes("outdoor")}
                onClick={() => set({ indoorOutdoor: toggle(f.indoorOutdoor, "outdoor") })}
              >
                🌳 Outdoor
              </button>
              <button className="chip" aria-pressed={f.vegan} onClick={() => set({ vegan: !f.vegan })}>
                🌱 Vegan
              </button>
              <button className="chip" aria-pressed={f.vegetarian} onClick={() => set({ vegetarian: !f.vegetarian })}>
                🥗 Vegetarian
              </button>
            </div>
          </div>

          {cities.length > 1 && (
            <div className="chip-row">
              <span className="row-label">City</span>
              <div className="chips">
                <InOutChips
                  options={shownCities.map((c) => ({ value: c.key, label: c.label, count: c.count }))}
                  value={f.cities}
                  onChange={(cities) => set({ cities })}
                />
                {cities.length > TOP_CITIES && (
                  <button
                    type="button"
                    className="chip chip-more"
                    aria-expanded={allCities}
                    onClick={() => setAllCities((v) => !v)}
                  >
                    {allCities ? "Fewer cities" : `More cities (${hiddenCities})`}
                  </button>
                )}
              </div>
            </div>
          )}

          {categories.length > 1 && (
            <div className="chip-row">
              <span className="row-label">Category</span>
              <div className="chips">
                <InOutChips
                  options={categories.map((c) => ({ value: c, label: `${categoryIcon(c)} ${c}` }))}
                  value={f.categories}
                  onChange={(categories) => set({ categories })}
                />
                {isFilterActive(f) && (
                  <button className="chip" onClick={() => setFilters(emptyFilters)}>
                    ✕ Clear all
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
