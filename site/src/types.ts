// Mirrors the Event schema in CLAUDE.md and scripts/lib/types.ts. Keep in sync.

export type Budget = "$" | "$$" | "$$$" | "$$$$" | "unknown";
export type IndoorOutdoor = "indoor" | "outdoor" | "both";
export type YesNoUnknown = "yes" | "no" | "unknown";
export type TimeOfDay = "morning" | "afternoon" | "evening";

export interface Weather {
  summary: string;
  temp_f: number | null;
}

export interface TriangleEvent {
  id: string;
  name: string;
  category: string;
  tags: string[];
  venue: string;
  address: string;
  city: string;
  lat: number | null;
  lon: number | null;
  start: string;
  end: string;
  duration_min: number | null;
  price: string;
  budget: Budget;
  indoor_outdoor: IndoorOutdoor;
  vegan: YesNoUnknown;
  vegetarian: YesNoUnknown;
  weather: Weather | null;
  image_url: string;
  booking_url: string;
  info_url: string;
  source: string;
  first_seen: string;
  last_verified: string;
  description?: string;
}

export interface Origin {
  name: string;
  lat: number;
  lon: number;
}

export interface EventsStore {
  schema_version: number;
  generated_at: string | null;
  week: string | null;
  origin?: Origin;
  events: TriangleEvent[];
}

export interface ItineraryStop {
  time: string;
  title: string;
  event_id?: string;
  location?: string;
  price?: string;
  notes?: string;
}

export interface ItineraryMeal {
  slot: "breakfast" | "lunch" | "dinner";
  place: string;
  city?: string;
  vegan_dish?: string;
  vegetarian_dish?: string;
  price?: string;
  url?: string;
}

export interface ItineraryAlternative {
  leg: string;
  good_weather: string;
  rain: string;
}

export interface Itinerary {
  id: string;
  title: string;
  theme: string;
  anchor_city: string;
  drive_time: string;
  weather: Weather | null;
  cost_range: string;
  date: string;
  overview: string;
  schedule: {
    morning: ItineraryStop[];
    afternoon: ItineraryStop[];
    evening: ItineraryStop[];
  };
  food: ItineraryMeal[];
  alternatives: ItineraryAlternative[];
  practical_notes: string[];
  event_ids: string[];
}

export interface ItinerariesStore {
  schema_version: number;
  generated_at: string | null;
  week: string | null;
  itineraries: Itinerary[];
}
