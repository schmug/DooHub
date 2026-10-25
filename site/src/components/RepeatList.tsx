import { useState } from "react";
import type { TriangleEvent } from "../types";
import { formatDayShort, formatTimeRange } from "../lib/format";
import { venueCount } from "../lib/series";
import { isAllDayOrTbd } from "../lib/timeRange";

interface Props {
  /** Every occurrence of the series, the card's own event included. */
  events: TriangleEvent[];
  isSelected: (id: string) => boolean;
  onToggle: (id: string) => void;
}

/** The "12 times this week" footer on a stacked series card. */
export default function RepeatList({ events, isSelected, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const venues = venueCount(events);
  const rows = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  return (
    <div className="repeats">
      <button type="button" className="repeats-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          {events.length} times{venues > 1 ? ` at ${venues} venues` : ""}
        </span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul className="repeats-list">
          {rows.map((ev) => {
            const url = [ev.booking_url, ev.info_url].find((u) => u && u !== "unknown");
            // One venue: the card already names it, so the row just links out.
            const where = venues > 1 ? (ev.venue && ev.venue !== "unknown" ? `${ev.venue}, ${ev.city}` : ev.city) : "Details";
            return (
              <li key={ev.id}>
                <input
                  type="checkbox"
                  checked={isSelected(ev.id)}
                  onChange={() => onToggle(ev.id)}
                  aria-label={`Select ${ev.name}, ${formatDayShort(ev.start)}`}
                />
                <span className="repeats-when">
                  {formatDayShort(ev.start)} · {isAllDayOrTbd(ev) ? "All day / TBD" : formatTimeRange(ev.start, ev.end)}
                </span>
                <span className="repeats-where">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {where}
                    </a>
                  ) : (
                    venues > 1 && where
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
