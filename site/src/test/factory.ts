import type { Origin, TriangleEvent } from "../types";

export const RALEIGH: Origin = { name: "Downtown Raleigh, NC", lat: 35.7796, lon: -78.6382 };

export function makeEvent(over: Partial<TriangleEvent> = {}): TriangleEvent {
  return {
    id: "e1",
    name: "Trivia Night",
    category: "trivia",
    tags: ["nightlife"],
    venue: "Trophy Brewing",
    address: "827 W Morgan St, Raleigh, NC 27603",
    city: "Raleigh",
    lat: 35.7796,
    lon: -78.653,
    start: "2026-06-20T19:00:00-04:00",
    end: "2026-06-20T21:00:00-04:00",
    duration_min: 120,
    price: "Free",
    budget: "$",
    indoor_outdoor: "indoor",
    vegan: "yes",
    vegetarian: "yes",
    weather: null,
    image_url: "https://example.com/x.jpg",
    booking_url: "",
    info_url: "https://example.com/info",
    source: "example.com",
    first_seen: "2026-06-13T08:00:00-04:00",
    last_verified: "2026-06-20T05:30:00-04:00",
    ...over,
  };
}
