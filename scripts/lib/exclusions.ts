// Topic exclusions — kinds of events the site's audience has said they don't
// want, regardless of how a source categorizes them. Pure + tested so the
// weekly run, `npm run validate`, and the doc agree on what gets dropped.
//
// Dating: speed dating, singles mixers, singles-group meetups. They arrive
// almost entirely from Phase B open discovery (Eventbrite, Meetup), filed
// under "nightlife", and a metro the size of the Triangle lists dozens a week.

import type { TriangleEvent } from "./types.js";

// Matched against the event name.
const DATING_NAME = [
  /speed[\s-]*dat/i, // "Speed Dating", "Speed Date®"
  /\bdating\b/i,
  /\bmatchmak/i,
];

// "Singles" in a name is dating unless it's the tennis/pickleball sense.
const SINGLES = /\bsingles\b/i;
const SINGLES_SPORT = /singles\s*(or|and|&|\/)\s*doubles|doubles\s*(or|and|&|\/)\s*singles|tennis|pickleball|badminton|ping[\s-]?pong/i;

// Matched against the description; narrower, because descriptions mention
// "singles" in other senses ("play singles", "hit singles").
const DATING_DESCRIPTION = [
  /speed[\s-]*dat/i,
  /\bdating (event|experience|night|show|game)/i,
  /\b(for|meet|meeting|amazing|eligible|christian) singles\b/i,
  /\bsingles (ages?|mixer|night|event|social|party)\b/i,
];

// Meetup groups organized around being single (e.g. ".../rtp-christian-singles/").
const SINGLES_GROUP_URL = /meetup\.com\/[^/?#]*singles?\b/i;

/** Why this event is excluded, or null if it's in scope. */
export function excludedTopic(ev: Pick<TriangleEvent, "name"> & Partial<Pick<TriangleEvent, "description" | "info_url" | "booking_url" | "source">>): string | null {
  const name = ev.name ?? "";
  if (DATING_NAME.some((re) => re.test(name))) return "dating";
  if (SINGLES.test(name) && !SINGLES_SPORT.test(name)) return "dating";
  const desc = ev.description ?? "";
  if (DATING_DESCRIPTION.some((re) => re.test(desc))) return "dating";
  for (const url of [ev.info_url, ev.booking_url, ev.source]) {
    if (url && SINGLES_GROUP_URL.test(url)) return "dating";
  }
  return null;
}
