import { useEffect, useMemo, useRef } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Origin, TriangleEvent } from "../../types";
import type { Theme } from "../../lib/theme";
import { boundsFor, boundsKey, mergeForMap, type Bounds } from "../../lib/mapMarkers";
import {
  categoryColor,
  categoryFamily,
  formatClock24,
  formatWeekdayShort,
  type CategoryFamily,
} from "../../lib/format";

interface Props {
  /** What the current filters left visible. */
  events: TriangleEvent[];
  /** The hand-picked set, in chronological order — drives numbering and bounds. */
  picked: TriangleEvent[];
  focusedId: string | null;
  /** Bumped on every focus request so re-clicking the same row re-focuses it. */
  focusNonce: number;
  hoveredId: string | null;
  origin: Origin;
  theme: Theme;
}

type MarkerLayer = L.CircleMarker | L.Marker;

// Light OSM raster vs. CARTO's "dark matter" basemap, so the tiles match the
// surrounding surface instead of glowing bright in dark mode.
const TILES = {
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const;

const LEGEND: { family: CategoryFamily; color: string; label: string }[] = [
  { family: "green", color: "#3f8568", label: "Museums · Parks" },
  { family: "purple", color: "#6f5aa6", label: "Concerts · Nightlife" },
  { family: "clay", color: "#b07b45", label: "Markets · Tastings" },
  { family: "blue", color: "#4a7aa6", label: "Sports · Classes" },
  { family: "rose", color: "#b05f7a", label: "Theater · Comedy" },
];

function hasCoords(ev: TriangleEvent): boolean {
  return typeof ev.lat === "number" && typeof ev.lon === "number";
}

/**
 * Numbered pin for a picked event.
 *
 * Interpolated into HTML because Leaflet's divIcon takes markup, so the inputs
 * are kept strictly internal: `n` is an array index and `color` comes from
 * `categoryColor`'s fixed palette. No event-supplied string goes in here — the
 * event's own text lives in the Popup, which React escapes.
 */
function numberedPin(n: number, color: string, hovered: boolean): L.DivIcon {
  return L.divIcon({
    className: "map-pin-icon",
    html: `<span class="map-pin${hovered ? " is-hovered" : ""}" style="--pin:${color}">${n}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

/** Fits the viewport to the picked set whenever that set's box actually changes. */
function FitBounds({ bounds }: { bounds: Bounds | null }) {
  const map = useMap();
  // Depend on the box's *value*, not the array's identity — otherwise every
  // render would look like a new box and yank the viewport out from under the user.
  const key = boundsKey(bounds);

  useEffect(() => {
    if (!bounds) return;
    // Deferred past the commit, and re-measured first: the map may have only
    // just mounted, or the sidebar may have appeared and narrowed the column.
    // Leaflet caches its container size, so fitting against the stale one lands
    // the selection off-centre — or in the corner, when the cache is still zero.
    const timer = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
      const [[south, west], [north, east]] = bounds;
      if (south === north && west === east) {
        // A single pick is a degenerate box; fitBounds would slam to max zoom.
        map.setView([south, west], 13, { animate: false });
      } else {
        // animate:false is load-bearing: an animated fit here gets interrupted
        // by the mount's own invalidateSize and silently leaves the map put.
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: false });
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // `bounds` is intentionally not a dep — `key` is its value-signature.
  }, [key, map]);

  return null;
}

/**
 * Leaflet caches its container size and doesn't observe the element, so the
 * sidebar appearing beside the map leaves tiles and marker positions computed
 * against the stale width until something tells it to re-measure.
 */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Pans to a row-clicked event and opens its popup. */
function FocusMarker({
  focusedId,
  focusNonce,
  markers,
}: {
  focusedId: string | null;
  focusNonce: number;
  markers: React.MutableRefObject<Map<string, MarkerLayer>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focusedId) return;
    const layer = markers.current.get(focusedId);
    if (!layer) return; // picked but has no coordinates, so nothing to fly to
    map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 13), { duration: 0.6 });
    layer.openPopup();
  }, [focusedId, focusNonce, map, markers]);
  return null;
}

function EventPopup({ ev }: { ev: TriangleEvent }) {
  const hasBooking = Boolean(ev.booking_url) && ev.booking_url !== "unknown";
  const hasInfo = Boolean(ev.info_url) && ev.info_url !== "unknown";

  return (
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
      {(hasBooking || hasInfo) && (
        <p className="links">
          {hasBooking && (
            <a href={ev.booking_url} target="_blank" rel="noopener noreferrer">
              Book
            </a>
          )}
          {hasBooking && hasInfo && " · "}
          {hasInfo && (
            <a href={ev.info_url} target="_blank" rel="noopener noreferrer">
              Info
            </a>
          )}
        </p>
      )}
    </div>
  );
}

export default function MapView({ events, picked, focusedId, focusNonce, hoveredId, origin, theme }: Props) {
  const markers = useRef(new Map<string, MarkerLayer>());

  // Picks the filters hid still plot — the selection is filter-independent.
  const plotted = useMemo(() => mergeForMap(events, picked), [events, picked]);
  const located = useMemo(() => plotted.filter(hasCoords), [plotted]);
  const order = useMemo(() => new Map(picked.map((ev, i) => [ev.id, i + 1])), [picked]);
  const bounds = useMemo(() => boundsFor(picked), [picked]);

  // Only the visible set drives the legend and the missing-coords note; a pick
  // dragged in from behind a filter shouldn't rewrite the reading of the filters.
  const missing = events.length - events.filter(hasCoords).length;
  const presentFamilies = new Set(located.map((e) => categoryFamily(e.category)));
  const tiles = TILES[theme];
  const hasSelection = order.size > 0;

  const track = (id: string) => (layer: MarkerLayer | null) => {
    if (layer) markers.current.set(id, layer);
    else markers.current.delete(id);
  };

  return (
    <div>
      <div className="map-wrap">
        <MapContainer center={[origin.lat, origin.lon]} zoom={10} scrollWheelZoom={false}>
          {/* keyed by theme so the basemap swaps cleanly on toggle */}
          <TileLayer key={theme} attribution={tiles.attribution} url={tiles.url} />
          <InvalidateOnResize />
          <FitBounds bounds={bounds} />

          {located.map((ev) => {
            const n = order.get(ev.id);
            const hovered = hoveredId === ev.id;
            const center: [number, number] = [ev.lat as number, ev.lon as number];

            // Picked events need text on the marker, which a CircleMarker can't
            // carry — hence the divIcon Marker for those and circles for the rest.
            return n !== undefined ? (
              <Marker
                key={ev.id}
                position={center}
                icon={numberedPin(n, categoryColor(ev.category), hovered)}
                zIndexOffset={1000}
                ref={track(ev.id)}
              >
                <Popup>
                  <EventPopup ev={ev} />
                </Popup>
              </Marker>
            ) : (
              <CircleMarker
                key={ev.id}
                center={center}
                radius={hovered ? 11 : hasSelection ? 6 : 9}
                pathOptions={{
                  // a white ring reads against both the light and dark basemaps
                  color: "#fff",
                  weight: hasSelection ? 1 : 2,
                  fillColor: categoryColor(ev.category),
                  // Unpicked markers recede once there's a selection to read.
                  fillOpacity: hasSelection ? 0.45 : 0.95,
                  opacity: hasSelection ? 0.6 : 1,
                }}
                ref={track(ev.id)}
              >
                <Popup>
                  <EventPopup ev={ev} />
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Must stay AFTER the markers. React runs effects in tree order, and
              react-leaflet's <Popup> binds itself to its parent layer from its
              own effect — placed earlier, this would call openPopup() on the
              first focus (the click that also mounts the map) before any popup
              was bound, and only the second click would work. */}
          <FocusMarker focusedId={focusedId} focusNonce={focusNonce} markers={markers} />
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
        <span className="notes">
          {hasSelection && (
            <span className="note">
              {order.size} numbered pin{order.size === 1 ? "" : "s"} = your itinerary
            </span>
          )}
          {missing > 0 && (
            <span className="note">
              {missing} event{missing === 1 ? "" : "s"} without coords not shown
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
