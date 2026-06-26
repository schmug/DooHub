import type { Itinerary, ItineraryStop, TriangleEvent } from "../types";
import { formatDayHeader, slugify, weatherIcon } from "../lib/format";
import { downloadIcs } from "../lib/ics";

interface Props {
  itineraries: Itinerary[];
  events: TriangleEvent[];
}

function StopRow({ stop }: { stop: ItineraryStop }) {
  return (
    <div className="sched-stop">
      <div className="stop-inner">
        <span className="t">{stop.time}</span>
        <div>
          <div className="title">
            {stop.title}
            {stop.price ? <span className="muted"> · {stop.price}</span> : null}
          </div>
          {stop.location ? <div className="loc">{stop.location}</div> : null}
          {stop.notes ? <div className="loc">{stop.notes}</div> : null}
        </div>
      </div>
    </div>
  );
}

function Block({ label, stops }: { label: string; stops: ItineraryStop[] }) {
  if (!stops.length) return null;
  return (
    <>
      <div className="block-label">{label}</div>
      {stops.map((s, i) => (
        <StopRow key={i} stop={s} />
      ))}
    </>
  );
}

function ItineraryCard({ itin, eventsById }: { itin: Itinerary; eventsById: Map<string, TriangleEvent> }) {
  const included = itin.event_ids.map((id) => eventsById.get(id)).filter((e): e is TriangleEvent => Boolean(e));

  return (
    <article className="itin-card cat-green">
      <div className="itin-top">
        <div className="theme">{itin.theme}</div>
        <h3>{itin.title}</h3>
        <div className="itin-meta">
          <span>📍 {itin.anchor_city}</span>
          <span>🗓 {formatDayHeader(`${itin.date}T12:00:00-04:00`)}</span>
          <span>🚗 {itin.drive_time}</span>
          {itin.weather && (
            <span>
              {weatherIcon(itin.weather.summary)} {itin.weather.summary}
              {typeof itin.weather.temp_f === "number" ? ` ${itin.weather.temp_f}°F` : ""}
            </span>
          )}
          <span>💰 {itin.cost_range}</span>
        </div>
      </div>

      <div className="itin-body">
        <p className="overview">{itin.overview}</p>

        <div className="timeline">
          <Block label="Morning" stops={itin.schedule.morning} />
          <Block label="Afternoon" stops={itin.schedule.afternoon} />
          <Block label="Evening" stops={itin.schedule.evening} />
        </div>

        {itin.food.length > 0 && (
          <div className="itin-section">
            <div className="sec-label">Food</div>
            {itin.food.map((m, i) => (
              <p className="food-row" key={i}>
                <b>{m.slot}:</b> {m.place}
                {m.city ? ` (${m.city})` : ""}
                {m.vegan_dish ? (
                  <>
                    {" — "}
                    <span className="veg-dish">🌱 {m.vegan_dish}</span>
                  </>
                ) : null}
                {m.vegetarian_dish ? (
                  <>
                    {" · "}
                    <span className="veg-dish">🥗 {m.vegetarian_dish}</span>
                  </>
                ) : null}
                {m.price ? <span style={{ color: "var(--mono-muted)" }}> · {m.price}</span> : null}
                {m.notes ? (
                  <>
                    <br />
                    <span className="loc">{m.notes}</span>
                  </>
                ) : null}
              </p>
            ))}
          </div>
        )}

        {itin.alternatives.length > 0 && (
          <div className="itin-section">
            <div className="sec-label">Weather backup</div>
            {itin.alternatives.map((a, i) => (
              <p className="alt-note" key={i}>
                <b>{a.leg}</b> — ☀️ {a.good_weather} &nbsp;·&nbsp; 🌧️ {a.rain}
              </p>
            ))}
          </div>
        )}

        {itin.practical_notes.length > 0 && (
          <div className="itin-section">
            <div className="sec-label">Practical notes</div>
            <ul className="notes-list">
              {itin.practical_notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="actions">
          <button
            className="btn btn-primary"
            disabled={included.length === 0}
            onClick={() => downloadIcs(included, `itinerary-${slugify(itin.title)}`, itin.title)}
          >
            📅 Add itinerary to Calendar
          </button>
        </div>
      </div>
    </article>
  );
}

export default function ItineraryView({ itineraries, events }: Props) {
  const eventsById = new Map(events.map((e) => [e.id, e]));

  if (itineraries.length === 0) {
    return (
      <div className="container section-pad">
        <div className="empty">
          <div className="empty-mark" aria-hidden>
            △
          </div>
          <h3>No itineraries yet</h3>
          <p>Curated outings are generated alongside the weekly events run.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container section-pad">
      <div className="itin-list">
        {itineraries.map((itin) => (
          <ItineraryCard key={itin.id} itin={itin} eventsById={eventsById} />
        ))}
      </div>
    </div>
  );
}
