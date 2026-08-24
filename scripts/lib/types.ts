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
 * Machine-readable feed formats `scripts/lib/feeds.ts` can parse.
 *
 * Deliberately does NOT include RSS/Atom. Four Triangle venues advertise a
 * working `<link rel="alternate">` feed and all four are the WordPress *blog*
 * feed — press releases, cast lists, "Job Opening — Marketing Manager". A feed
 * only counts as an event feed if its items carry event start times, so a bare
 * `/feed/` is never wired up here. See prompts/weekly.md § Phase A.
 */
export const FEED_TYPES = ["ics", "localist"] as const;
export type FeedType = (typeof FEED_TYPES)[number];

/**
 * How far a feed's listings range, which decides what an item with no place of
 * its own means:
 *
 * - `local` (default) — the feed only lists what happens at the source itself,
 *   so a bare "Duke South, Room M224" is the source's own city.
 * - `traveling` — the feed follows a team or covers a wide region, so an item
 *   must positively prove it is in the Triangle. Without this, goheels' away
 *   game at "Dublin, Ireland (Aviva Stadium)" would inherit Chapel Hill: no US
 *   state token disqualifies it, and enumerating countries is a losing game.
 */
export const FEED_SCOPES = ["local", "traveling"] as const;
export type FeedScope = (typeof FEED_SCOPES)[number];

/**
 * How to read a source, when a plain fetch of `EventSource.url` is not the way.
 * `mode` is the discriminant so later ingest paths can join as new members
 * without reshaping this.
 */
export interface FeedIngestHint {
  mode: "feed";
  /** The feed endpoint — NOT the human page. */
  feed_url: string;
  feed_type: FeedType;
  /** Defaults to "local". See FEED_SCOPES. */
  feed_scope?: FeedScope;
}

/**
 * How to pull events out of a rendered page. "auto" (the default) reads
 * schema.org JSON-LD when the DOM has any Event nodes and falls back to the
 * rendered text when it doesn't; the explicit values pin one strategy, which is
 * what you want on a source whose surface is known — a page that quietly stops
 * emitting JSON-LD should report zero loudly, not start guessing at text.
 */
export const RENDER_EXTRACTS = ["auto", "json-ld", "text"] as const;
export type RenderExtract = (typeof RENDER_EXTRACTS)[number];

/**
 * Read this source from a rendered DOM (`scripts/render_source.ts`) because a
 * plain fetch cannot see its listings: they are drawn client-side, or the origin
 * rejects scripted requests outright.
 *
 * Rendering is the expensive path and the LAST one. Declare it only after no URL
 * on the site serves the listing to a plain fetch — burning-coal-theatre looked
 * like it needed a browser and only needed the right page.
 */
export interface RenderIngestHint {
  mode: "render";
  /** Page to render, when it is not the source's own `url`. */
  url?: string;
  /** Defaults to "auto". See RENDER_EXTRACTS. */
  extract?: RenderExtract;
  /** Evidence: what a plain fetch actually returns, and why a browser is needed. */
  reason?: string;
}

export type SourceIngest = FeedIngestHint | RenderIngestHint;

export const INGEST_MODES = ["feed", "render"] as const;

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
  /** How to read this source when a plain fetch of `url` is not the way. */
  ingest?: SourceIngest;
  notes?: string;
}

export interface SourcesRegistry {
  schema_version: number;
  sources: EventSource[];
}

export const SOURCE_KINDS: ReadonlyArray<SourceKind> = ["venue", "hub", "aggregator"];

/**
 * Per-run discovery telemetry (data/source_coverage.json). Read by a human in
 * the PR body — nothing consumes it programmatically. Its job is to surface a
 * seed that has quietly stopped producing, and to show whether open-ended
 * discovery is still pulling its weight against the registry.
 */
export interface SourceCoverage {
  week: string;
  generated_at: string;
  /** source id -> events contributed this run */
  per_source: Record<string, number>;
  /** ids from per_source that contributed 0 */
  zero_hit: string[];
  off_registry_sources: number;
  off_registry_events: number;
  total_events: number;
}
