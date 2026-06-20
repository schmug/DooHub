import type { EventsStore, Itinerary, ItinerariesStore, Origin, TriangleEvent } from "../types";
import { sampleEvents } from "./sampleEvents";
import { sampleItineraries } from "./sampleItineraries";

const DEFAULT_ORIGIN: Origin = { name: "Downtown Raleigh, NC", lat: 35.7796, lon: -78.6382 };

export interface LoadedData {
  events: TriangleEvent[];
  itineraries: Itinerary[];
  origin: Origin;
  generatedAt: string | null;
  week: string | null;
  isSample: boolean;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Loads the published store (public/events.json + itineraries.json). When the
 * store is missing or empty — i.e. before the first real pipeline run — falls
 * back to bundled sample fixtures so the page always renders something.
 */
export async function loadData(): Promise<LoadedData> {
  const [eStore, iStore] = await Promise.all([
    fetchJson<EventsStore>("events.json"),
    fetchJson<ItinerariesStore>("itineraries.json"),
  ]);

  const hasReal = !!eStore && Array.isArray(eStore.events) && eStore.events.length > 0;
  if (hasReal && eStore) {
    return {
      events: eStore.events,
      itineraries: iStore?.itineraries ?? [],
      origin: eStore.origin ?? DEFAULT_ORIGIN,
      generatedAt: eStore.generated_at,
      week: eStore.week,
      isSample: false,
    };
  }

  return {
    events: sampleEvents,
    itineraries: sampleItineraries,
    origin: DEFAULT_ORIGIN,
    generatedAt: null,
    week: null,
    isSample: true,
  };
}
