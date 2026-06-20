import type { Origin } from "../types";

const R_MILES = 3958.8;

export type DistanceBand = "0-5" | "5-15" | "15-30" | "30+";

export const DISTANCE_BANDS: { value: DistanceBand; label: string }[] = [
  { value: "0-5", label: "≤ 5 mi" },
  { value: "5-15", label: "5–15 mi" },
  { value: "15-30", label: "15–30 mi" },
  { value: "30+", label: "30+ mi" },
];

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in miles. */
export function haversineMiles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(h));
}

/** Rough drive-time estimate (~37 mph average incl. surface streets). */
export function driveMinutes(miles: number): number {
  return Math.max(1, Math.round(miles / 0.62));
}

export function bandFor(miles: number): DistanceBand {
  if (miles <= 5) return "0-5";
  if (miles <= 15) return "5-15";
  if (miles <= 30) return "15-30";
  return "30+";
}

export interface DistanceInfo {
  miles: number;
  minutes: number;
  band: DistanceBand;
}

export function distanceFrom(origin: Origin, lat: number | null, lon: number | null): DistanceInfo | null {
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const miles = haversineMiles(origin.lat, origin.lon, lat, lon);
  return { miles, minutes: driveMinutes(miles), band: bandFor(miles) };
}
