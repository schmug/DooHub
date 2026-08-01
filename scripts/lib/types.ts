// Shared types for the pipeline scripts. These mirror the Event schema in
// CLAUDE.md (§ "Event schema") and the site's own `site/src/types.ts`. If you
// change the schema, update all three together — CLAUDE.md is authoritative.

export type Budget = "$" | "$$" | "$$$" | "$$$$";
export type IndoorOutdoor = "indoor" | "outdoor" | "both";
export type YesNoUnknown = "yes" | "no" | "unknown";

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
  start: string; // ISO-8601 with America/New_York offset
  end: string; // ISO-8601 with America/New_York offset
  duration_min: number | null;
  price: string; // human: "Free", "$15", "$10-$25"
  budget: Budget | "unknown";
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
  // Extension to the CLAUDE.md schema: a short human blurb for the card + ics
  // DESCRIPTION. Optional; absent/"" is fine.
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
  time: string; // human label, e.g. "9:00 AM"
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
  notes?: string;
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
  date: string; // ISO date (YYYY-MM-DD) for the outing
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

// Authoritative coverage categories (CLAUDE.md § Coverage). Validation warns on
// anything outside this set.
export const COVERAGE_CATEGORIES = [
  "festivals",
  "concerts",
  "theater",
  "markets",
  "sports",
  "galleries",
  "museums",
  "tours",
  "classes",
  "breweries/tastings",
  "trivia",
  "parks",
  "trails",
  "historic sites",
  "shopping",
  "family/kids",
  "food events",
  "comedy",
  "nightlife",
] as const;

export const BUDGETS: ReadonlyArray<Budget | "unknown"> = ["$", "$$", "$$$", "$$$$", "unknown"];
export const INDOOR_OUTDOOR: ReadonlyArray<IndoorOutdoor> = ["indoor", "outdoor", "both"];
export const YES_NO_UNKNOWN: ReadonlyArray<YesNoUnknown> = ["yes", "no", "unknown"];

export type SourceKind = "venue" | "hub" | "aggregator";

/**
 * A seed discovery source (data/sources.json). The registry is a FLOOR for the
 * weekly run's Phase A sweep, not the search space — see prompts/weekly.md.
 */
export interface EventSource {
  id: string; // unique, kebab-case
  name: string;
  kind: SourceKind;
  url: string;
  city: string;
  /** Containing complex, when this source is a hall inside a larger venue. */
  parent_venue?: string;
  /** Other names sources use for this venue (renames, acronyms, spellings). */
  venue_aliases?: string[];
  categories: string[];
  /** True when the origin 403s a plain fetch but serves via WebFetch. */
  fetch_blocked?: boolean;
  notes?: string;
}

export interface SourcesRegistry {
  schema_version: number;
  sources: EventSource[];
}

export const SOURCE_KINDS: ReadonlyArray<SourceKind> = ["venue", "hub", "aggregator"];
