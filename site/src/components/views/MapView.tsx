import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Origin, TriangleEvent } from "../../types";
import {
  categoryColor,
  categoryFamily,
  formatClock24,
  formatWeekdayShort,
  type CategoryFamily,
} from "../../lib/format";

interface Props {
  events: TriangleEvent[];
  origin: Origin;
}

const LEGEND: { family: CategoryFamily; color: string; label: string }[] = [
  { family: "green", color: "#3f8568", label: "Museums · Parks" },
  { family: "purple", color: "#6f5aa6", label: "Concerts · Nightlife" },
  { family: "clay", color: "#b07b45", label: "Markets · Tastings" },
  { family: "blue", color: "#4a7aa6", label: "Sports · Classes" },
  { family: "rose", color: "#b05f7a", label: "Theater · Comedy" },
];

export default function MapView({ events, origin }: Props) {
  const located = events.filter((e) => typeof e.lat === "number" && typeof e.lon === "number");
  const missing = events.length - located.length;
  const presentFamilies = new Set(located.map((e) => categoryFamily(e.category)));

  return (
    <div>
      <div className="map-wrap">
        <MapContainer center={[origin.lat, origin.lon]} zoom={10} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {located.map((ev) => (
            <CircleMarker
              key={ev.id}
              center={[ev.lat as number, ev.lon as number]}
              radius={9}
              pathOptions={{
                color: "#fff",
                weight: 2,
                fillColor: categoryColor(ev.category),
                fillOpacity: 0.95,
              }}
            >
              <Popup>
                <div
                  className={`map-popup cat-${categoryFamily(ev.category)}`}
                  style={{ borderLeftColor: categoryColor(ev.category) }}
                >
                  <span className="cat-tag">{ev.category}</span>
                  <h4>{ev.name}</h4>
                  <p>
                    {ev.venue} · {ev.city}
                    <br />
                    {formatWeekdayShort(ev.start)} · {formatClock24(ev.start)}
                    {ev.price ? ` · ${/free/i.test(ev.price) ? "FREE" : ev.price}` : ""}
                  </p>
                  {(ev.booking_url !== "unknown" || ev.info_url !== "unknown") && (
                    <p className="links">
                      {ev.booking_url && ev.booking_url !== "unknown" && (
                        <a href={ev.booking_url} target="_blank" rel="noopener noreferrer">
                          Book
                        </a>
                      )}
                      {ev.booking_url !== "unknown" && ev.info_url !== "unknown" && " · "}
                      {ev.info_url && ev.info_url !== "unknown" && (
                        <a href={ev.info_url} target="_blank" rel="noopener noreferrer">
                          Info
                        </a>
                      )}
                    </p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div className="map-legend">
        <div className="keys">
          {LEGEND.filter((l) => presentFamilies.has(l.family)).map((l) => (
            <span key={l.family}>
              <span className="dot" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
        {missing > 0 && (
          <span className="note">
            {missing} event{missing === 1 ? "" : "s"} without coords not shown
          </span>
        )}
      </div>
    </div>
  );
}
