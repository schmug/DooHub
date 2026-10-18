import type { Origin } from "../types";

const R_MILES = 3958.8;

/** Range of the "within N miles" slider. The top stop means "any distance". */
export const MIN_SLIDER_MILES = 1;
export const MAX_SLIDER_MILES = 50;

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

export interface DistanceInfo {
  miles: number;
  minutes: number;
}

export function distanceFrom(origin: Origin, lat: number | null, lon: number | null): DistanceInfo | null {
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const miles = haversineMiles(origin.lat, origin.lon, lat, lon);
  return { miles, minutes: driveMinutes(miles) };
}
