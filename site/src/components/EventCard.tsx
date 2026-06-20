import { useState } from "react";
import type { Origin, TriangleEvent } from "../types";
import { distanceFrom } from "../lib/distance";
import {
  budgetColorVar,
  categoryIcon,
  formatDayShort,
  formatTimeRange,
  ioIcon,
  ioLabel,
  slugify,
  weatherIcon,
} from "../lib/format";
import { downloadIcs } from "../lib/ics";

interface Props {
  ev: TriangleEvent;
  origin: Origin;
  showDay?: boolean;
}

export default function EventCard({ ev, origin, showDay = false }: Props) {
  const [imgOk, setImgOk] = useState(Boolean(ev.image_url) && ev.image_url !== "unknown");
  const dist = distanceFrom(origin, ev.lat, ev.lon);
  const link = ev.booking_url && ev.booking_url !== "unknown" ? ev.booking_url : "";
  const info = ev.info_url && ev.info_url !== "unknown" ? ev.info_url : "";

  return (
    <article className="event-card">
      <div className="media">
        {imgOk ? (
          <img src={ev.image_url} alt="" loading="lazy" onError={() => setImgOk(false)} />
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 46 }} aria-hidden>
            {categoryIcon(ev.category)}
          </div>
        )}
        <span className="cat-badge">
          <span aria-hidden>{categoryIcon(ev.category)}</span>
          {ev.category}
        </span>
        {ev.budget !== "unknown" && (
          <span className="budget-badge" style={{ background: budgetColorVar(ev.budget) }}>
            {ev.budget}
          </span>
        )}
      </div>

      <div className="body">
        <h3>{ev.name}</h3>

        <div className="meta-line">
          <span>📍 {ev.city}, NC</span>
          {dist && (
            <span className="dist">
              {dist.minutes} min ({dist.miles.toFixed(0)} mi)
            </span>
          )}
        </div>

        <div className="when">
          🕐 {showDay && <>{formatDayShort(ev.start)} · </>}
          {formatTimeRange(ev.start, ev.end)}
        </div>

        <div className="price-weather">
          💵 {ev.price || "—"}
          {ev.weather && (
            <>
              {" · "}
              {weatherIcon(ev.weather.summary)} {ev.weather.summary}
              {typeof ev.weather.temp_f === "number" ? ` ${ev.weather.temp_f}°F` : ""}
            </>
          )}
        </div>

        <div className="tagrow">
          <span className="pill io" title={ioLabel(ev.indoor_outdoor)}>
            {ioIcon(ev.indoor_outdoor)} {ioLabel(ev.indoor_outdoor)}
          </span>
          {ev.vegan === "yes" && <span className="pill diet">🌱 Vegan</span>}
          {ev.vegan !== "yes" && ev.vegetarian === "yes" && <span className="pill diet">🥗 Veg</span>}
          {ev.tags.slice(0, 2).map((t) => (
            <span className="pill" key={t}>
              {t}
            </span>
          ))}
        </div>

        {ev.description && <p className="desc">{ev.description}</p>}

        <div className="actions">
          {link && (
            <a className="btn btn-primary btn-link" href={link} target="_blank" rel="noopener noreferrer">
              Book
            </a>
          )}
          <button className="btn" onClick={() => downloadIcs([ev], slugify(ev.name), ev.name)}>
            📅 Add to Calendar
          </button>
          {info && (
            <a className="btn btn-link" href={info} target="_blank" rel="noopener noreferrer">
              Info
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
