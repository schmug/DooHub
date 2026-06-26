import { useState } from "react";
import type { Origin, TriangleEvent } from "../types";
import { distanceFrom } from "../lib/distance";
import {
  categoryFamily,
  categoryIcon,
  formatTimeRange,
  formatWeekdayShort,
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

export default function EventCard({ ev, origin }: Props) {
  const [imgOk, setImgOk] = useState(Boolean(ev.image_url) && ev.image_url !== "unknown");
  const dist = distanceFrom(origin, ev.lat, ev.lon);
  const link = ev.booking_url && ev.booking_url !== "unknown" ? ev.booking_url : "";
  const info = ev.info_url && ev.info_url !== "unknown" ? ev.info_url : "";
  const fam = categoryFamily(ev.category);

  const isFree = Boolean(ev.price) && /free/i.test(ev.price);
  const priceBadge = isFree ? "Free" : ev.budget !== "unknown" ? ev.budget : "";
  // Third board cell: weather reads best for outdoor/free events; otherwise the
  // price detail (e.g. "$25 ADV") is the more useful "departure-board" datum.
  const hasWeather = Boolean(ev.weather && (ev.weather.summary || typeof ev.weather.temp_f === "number"));

  return (
    <article className={`event-card cat-${fam}`}>
      <div className="media">
        {imgOk ? (
          <img src={ev.image_url} alt="" loading="lazy" onError={() => setImgOk(false)} />
        ) : (
          <div className="media-fallback" aria-hidden>
            {categoryIcon(ev.category)}
          </div>
        )}
        <span className="cat-badge">
          <span aria-hidden>{categoryIcon(ev.category)}</span>
          {ev.category}
        </span>
        {priceBadge && <span className="budget-badge">{priceBadge}</span>}
      </div>

      <div className="body">
        <h3>{ev.name}</h3>

        <div className="board">
          <div className="cell">
            <div className="k">When</div>
            {formatWeekdayShort(ev.start)} · {formatTimeRange(ev.start, ev.end)}
          </div>
          <div className="cell">
            <div className="k">Where</div>
            {ev.city.toUpperCase()}
            {dist ? ` · ${dist.minutes}m` : ""}
          </div>
          <div className="cell">
            {hasWeather ? (
              <>
                <div className="k">Weather</div>
                {weatherIcon(ev.weather!.summary)}
                {typeof ev.weather!.temp_f === "number" ? ` ${ev.weather!.temp_f}°F` : ` ${ev.weather!.summary}`}
              </>
            ) : (
              <>
                <div className="k">Price</div>
                {ev.price || "—"}
              </>
            )}
          </div>
        </div>

        <div className="tagrow">
          <span className="pill" title={ioLabel(ev.indoor_outdoor)}>
            {ioIcon(ev.indoor_outdoor)} {ioLabel(ev.indoor_outdoor)}
          </span>
          {ev.vegan === "yes" && <span className="pill">🌱 Vegan</span>}
          {ev.vegan !== "yes" && ev.vegetarian === "yes" && <span className="pill">🥗 Veg</span>}
          {ev.tags.slice(0, 2).map((t) => (
            <span className="pill" key={t}>
              {t}
            </span>
          ))}
        </div>

        {ev.description && <p className="desc">{ev.description}</p>}

        <div className="actions">
          {link ? (
            <a className="btn book btn-link" href={link} target="_blank" rel="noopener noreferrer">
              Book
            </a>
          ) : info ? (
            <a className="btn outline btn-link" href={info} target="_blank" rel="noopener noreferrer">
              Info
            </a>
          ) : null}
          <button className="btn soft" onClick={() => downloadIcs([ev], slugify(ev.name), ev.name)}>
            📅 Add
          </button>
          {link && info && (
            <a className="btn outline btn-link" href={info} target="_blank" rel="noopener noreferrer">
              Info
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
