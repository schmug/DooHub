import { useState } from "react";
import type { TriangleEvent } from "../types";
import { downloadIcs } from "../lib/ics";
import { selectedEvents } from "../lib/selection";
import { summarizeSelection } from "../lib/selectionSummary";
import { useMediaQuery } from "../lib/useMediaQuery";
import { formatClock24, formatWeekdayShort } from "../lib/format";

/** Below this the panel stops being a docked column and becomes a bottom sheet. */
export const COMPACT_QUERY = "(max-width: 900px)";

interface Props {
  events: TriangleEvent[];
  ids: string[];
  focusedId: string | null;
  hoveredId: string | null;
  onToggle: (id: string) => void;
  onClear: () => void;
  onFocus: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * The hand-picked set, listed. Docked beside the results on desktop; at compact
 * widths it collapses to a fixed bottom handle — the bar this replaced — that
 * taps open into a sheet.
 *
 * The list is deliberately independent of the active filters: a pick a filter
 * hides still shows here, still counts, and still exports, which is the same
 * rule the map follows via `mergeForMap`.
 */
export default function SelectionSidebar({
  events,
  ids,
  focusedId,
  hoveredId,
  onToggle,
  onClear,
  onFocus,
  onHover,
}: Props) {
  const compact = useMediaQuery(COMPACT_QUERY);
  const [open, setOpen] = useState(false);

  const picked = selectedEvents(events, ids);
  if (picked.length === 0) return null;

  const summary = summarizeSelection(picked);
  // Docked, the list is always visible; only the sheet actually collapses.
  const expanded = !compact || open;

  const heading = (
    <>
      <span className="selection-title">Your itinerary</span>
      <span className="selection-summary">
        <strong>{summary.count}</strong> event{summary.count === 1 ? "" : "s"}
        {summary.daySpan && ` · ${summary.daySpan}`}
        {summary.costRange && ` · ${summary.costRange}`}
      </span>
    </>
  );

  return (
    <aside
      className={`selection-sidebar${expanded ? " is-open" : ""}`}
      role="region"
      aria-label="Selected events"
    >
      <div className="selection-head">
        {compact ? (
          <button
            type="button"
            className="selection-handle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="selection-list"
          >
            {heading}
            <span className="selection-chevron" aria-hidden>
              {open ? "▾" : "▴"}
            </span>
          </button>
        ) : (
          <div className="selection-handle">{heading}</div>
        )}
        <div className="selection-actions">
          <button type="button" className="btn" onClick={onClear}>
            Clear
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              downloadIcs(picked, "triangle-weekend-itinerary", "Triangle Weekend — My Itinerary")
            }
          >
            ⬇ Export .ics
          </button>
        </div>
      </div>

      <ol className="selection-list" id="selection-list">
        {picked.map((ev, i) => (
          <li
            key={ev.id}
            className={`selection-row${focusedId === ev.id ? " is-focused" : ""}${
              hoveredId === ev.id ? " is-hovered" : ""
            }`}
            onMouseEnter={() => onHover(ev.id)}
            onMouseLeave={() => onHover(null)}
          >
            {/* A real button, so the map cross-highlight is keyboard reachable;
                the hover pulse is a pointer-only enhancement on top of it. */}
            <button
              type="button"
              className="selection-row-main"
              onClick={() => onFocus(ev.id)}
              onFocus={() => onHover(ev.id)}
              onBlur={() => onHover(null)}
              title="Show on map"
            >
              {/* Matches the numbered pin the map draws for this event. */}
              <span className="selection-num" aria-hidden>
                {i + 1}
              </span>
              <span className="selection-row-text">
                <span className="selection-name">{ev.name}</span>
                <span className="selection-meta">
                  {formatWeekdayShort(ev.start)} · {formatClock24(ev.start)} · {ev.city}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="selection-remove"
              onClick={() => onToggle(ev.id)}
              aria-label={`Remove ${ev.name} from your itinerary`}
              title="Remove"
            >
              ×
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
