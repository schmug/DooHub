import type { Origin, TriangleEvent } from "../../types";
import { categoryIcon, dayKey, formatDayHeader } from "../../lib/format";
import { collapseSeries } from "../../lib/series";
import EventCard from "../EventCard";
import RepeatList from "../RepeatList";

type GroupBy = "day" | "city" | "category";

interface Props {
  events: TriangleEvent[];
  origin: Origin;
  groupBy: GroupBy;
  /** Stack a recurring series into one card with an occurrence list. */
  stackRepeats?: boolean;
  isSelected: (id: string) => boolean;
  onToggle: (id: string) => void;
}

function keyOf(ev: TriangleEvent, g: GroupBy): string {
  if (g === "day") return dayKey(ev.start);
  if (g === "city") return ev.city;
  return ev.category;
}

function headerOf(g: GroupBy, key: string): string {
  if (g === "day") return formatDayHeader(`${key}T12:00:00-04:00`);
  if (g === "category") return `${categoryIcon(key)} ${key}`;
  return key;
}

export default function GroupedView({ events, origin, groupBy, stackRepeats = false, isSelected, onToggle }: Props) {
  // By Day stacks a series across the whole week under the day it next occurs;
  // By City / By Category stack only within a group, so an occurrence is never
  // pulled out of the city or category it belongs to. Unstacked, every event
  // is its own one-item series.
  const items = stackRepeats
    ? collapseSeries(events, groupBy === "day" ? undefined : (ev) => keyOf(ev, groupBy))
    : events.map((ev) => ({ key: ev.id, lead: ev, events: [ev] }));
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const k = keyOf(item.lead, groupBy);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  // Header counts are real per-group event counts, whatever got stacked where.
  const counts = new Map<string, number>();
  for (const ev of events) counts.set(keyOf(ev, groupBy), (counts.get(keyOf(ev, groupBy)) ?? 0) + 1);
  // Day keys (YYYY-MM-DD) sort chronologically; city/category alphabetically.
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <div>
      {keys.map((k) => {
        const list = groups.get(k)!;
        const n = counts.get(k) ?? 0;
        return (
          <section className="group" key={k}>
            <div className="group-header">
              <h2>{headerOf(groupBy, k)}</h2>
              <span className="group-count">
                {n} event{n === 1 ? "" : "s"}
              </span>
            </div>
            <div className="event-grid">
              {list.map(({ lead, events: occ }) => (
                <EventCard
                  key={lead.id}
                  ev={lead}
                  origin={origin}
                  showDay={groupBy !== "day"}
                  selected={isSelected(lead.id)}
                  onToggle={onToggle}
                >
                  {occ.length > 1 && <RepeatList events={occ} isSelected={isSelected} onToggle={onToggle} />}
                </EventCard>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
