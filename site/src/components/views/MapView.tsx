import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Origin, TriangleEvent } from "../../types";
import { budgetColorVar, formatDayShort, formatTimeRange } from "../../lib/format";

interface Props {
  events: TriangleEvent[];
  origin: Origin;
}

export default function MapView({ events, origin }: Props) {
  const located = events.filter((e) => typeof e.lat === "number" && typeof e.lon === "number");
  const missing = events.length - located.length;

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
                fillColor: budgetColorVar(ev.budget),
                fillOpacity: 0.9,
              }}
            >
              <Popup>
                <div className="map-popup">
                  <h4>{ev.name}</h4>
                  <p>
                    {ev.venue} · {ev.city}
                  </p>
                  <p>
                    {formatDayShort(ev.start)} · {formatTimeRange(ev.start, ev.end)}
                  </p>
                  <p>{ev.price || ""}</p>
                  <p>
                    {ev.booking_url && ev.booking_url !== "unknown" && (
                      <a href={ev.booking_url} target="_blank" rel="noopener noreferrer">
                        Book
                      </a>
                    )}
                    {ev.info_url && ev.info_url !== "unknown" && (
                      <>
                        {" · "}
                        <a href={ev.info_url} target="_blank" rel="noopener noreferrer">
                          Info
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      {missing > 0 && (
        <p className="results-count" style={{ marginTop: 10 }}>
          {missing} event{missing === 1 ? "" : "s"} without map coordinates not shown.
        </p>
      )}
    </div>
  );
}
