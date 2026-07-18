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
