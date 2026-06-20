import type { Origin, TriangleEvent } from "../../types";
import { distanceFrom } from "../../lib/distance";
import { budgetColorVar, categoryIcon, formatDayShort, formatTimeRange, slugify } from "../../lib/format";
import { downloadIcs } from "../../lib/ics";

interface Props {
  events: TriangleEvent[];
  origin: Origin;
}

export default function TableView({ events, origin }: Props) {
  return (
    <div className="table-wrap">
      <table className="events">
        <thead>
          <tr>
            <th>Event</th>
            <th>Category</th>
            <th>City</th>
            <th>Distance</th>
            <th>When</th>
            <th>Price</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => {
            const d = distanceFrom(origin, ev.lat, ev.lon);
            const book = ev.booking_url && ev.booking_url !== "unknown" ? ev.booking_url : "";
            const info = ev.info_url && ev.info_url !== "unknown" ? ev.info_url : "";
            return (
              <tr key={ev.id}>
                <td>
                  <span className="nm">{ev.name}</span>
                  <br />
                  <span style={{ color: "var(--ink-3)" }}>{ev.venue}</span>
                </td>
                <td>
                  {categoryIcon(ev.category)} {ev.category}
                </td>
                <td>{ev.city}</td>
                <td>{d ? `${d.minutes} min (${d.miles.toFixed(0)} mi)` : "—"}</td>
                <td>
                  {formatDayShort(ev.start)}
                  <br />
                  <span style={{ color: "var(--ink-2)" }}>{formatTimeRange(ev.start, ev.end)}</span>
                </td>
                <td>
                  {ev.price || "—"}
                  {ev.budget !== "unknown" && (
                    <>
                      {" "}
                      <span
                        className="pill budget"
                        style={{ background: budgetColorVar(ev.budget), fontSize: 11 }}
                      >
                        {ev.budget}
                      </span>
                    </>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {book && (
                    <a href={book} target="_blank" rel="noopener noreferrer">
                      Book
                    </a>
                  )}
                  {book && info && " · "}
                  {info && (
                    <a href={info} target="_blank" rel="noopener noreferrer">
                      Info
                    </a>
                  )}
                  {(book || info) && " · "}
                  <button
                    className="btn"
                    style={{ padding: "2px 8px", fontSize: 12 }}
                    onClick={() => downloadIcs([ev], slugify(ev.name), ev.name)}
                  >
                    📅
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
