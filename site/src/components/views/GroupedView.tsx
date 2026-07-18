import type { Origin, TriangleEvent } from "../../types";
import { categoryIcon, dayKey, formatDayHeader } from "../../lib/format";
import EventCard from "../EventCard";

type GroupBy = "day" | "city" | "category";

interface Props {
  events: TriangleEvent[];
  origin: Origin;
  groupBy: GroupBy;
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

export default function GroupedView({ events, origin, groupBy, isSelected, onToggle }: Props) {
  const groups = new Map<string, TriangleEvent[]>();
  for (const ev of events) {
    const k = keyOf(ev, groupBy);
    const list = groups.get(k);
    if (list) list.push(ev);
    else groups.set(k, [ev]);
  }
  // Day keys (YYYY-MM-DD) sort chronologically; city/category alphabetically.
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <div>
      {keys.map((k) => {
        const list = groups.get(k)!;
        return (
          <section className="group" key={k}>
            <div className="group-header">
              <h2>{headerOf(groupBy, k)}</h2>
              <span className="group-count">
                {list.length} event{list.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="event-grid">
              {list.map((ev) => (
                <EventCard
                  key={ev.id}
                  ev={ev}
                  origin={origin}
                  showDay={groupBy !== "day"}
                  selected={isSelected(ev.id)}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
