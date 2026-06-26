import type { Origin, TriangleEvent } from "../../types";
import { distanceFrom } from "../../lib/distance";
import { categoryFamily, formatClock24, formatWeekdayShort, slugify } from "../../lib/format";
import { downloadIcs } from "../../lib/ics";

interface Props {
  events: TriangleEvent[];
  origin: Origin;
}

export default function TableView({ events, origin }: Props) {
  return (
    <div className="table-scroller">
      <p className="table-hint" aria-hidden="true">
        Swipe sideways for distance, time, price &amp; links →
      </p>
      <div className="table-wrap">
        <table className="events">
          <thead>
            <tr>
              <th>Event</th>
              <th>Category</th>
              <th>Stop</th>
              <th>Dist</th>
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
              const price = ev.price ? (/free/i.test(ev.price) ? "FREE" : ev.price) : "—";
              return (
                <tr key={ev.id} className={`cat-${categoryFamily(ev.category)}`}>
                  <td>
                    <div className="nm">{ev.name}</div>
                    <div className="venue">{ev.venue}</div>
                  </td>
                  <td>
                    <span className="cat-tag">{ev.category}</span>
                  </td>
                  <td className="mono">{ev.city}</td>
                  <td className="mono">{d ? `${d.minutes}m` : "—"}</td>
                  <td className="when">
                    {formatWeekdayShort(ev.start)}
                    <br />
                    <span className="clock">{formatClock24(ev.start)}</span>
                  </td>
                  <td className="price">{price}</td>
                  <td className="links">
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
                      className="ics"
                      title="Add to calendar"
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
      <p className="table-note">↳ The left rule is the category line; mono times &amp; stops read like a transit board.</p>
    </div>
  );
}
