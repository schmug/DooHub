import { describe, it, expect } from "vitest";
import { bandFor, distanceFrom, driveMinutes, haversineMiles } from "./distance";
import { RALEIGH } from "../test/factory";

describe("haversineMiles", () => {
  it("is zero for the same point", () => {
    expect(haversineMiles(RALEIGH.lat, RALEIGH.lon, RALEIGH.lat, RALEIGH.lon)).toBeCloseTo(0, 5);
  });

  it("gives a sane Triangle-scale distance (Raleigh → NCMA ≈ 3–6 mi)", () => {
    const d = haversineMiles(RALEIGH.lat, RALEIGH.lon, 35.8101, -78.7028);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(6);
  });
});

describe("driveMinutes", () => {
  it("never returns less than 1", () => {
    expect(driveMinutes(0.05)).toBe(1);
  });
  it("scales with distance", () => {
    expect(driveMinutes(20)).toBeGreaterThan(driveMinutes(5));
  });
});

describe("bandFor", () => {
  it("classifies at the boundaries", () => {
    expect(bandFor(5)).toBe("0-5");
    expect(bandFor(5.1)).toBe("5-15");
    expect(bandFor(15)).toBe("5-15");
    expect(bandFor(15.1)).toBe("15-30");
    expect(bandFor(30)).toBe("15-30");
    expect(bandFor(30.1)).toBe("30+");
  });
});

describe("distanceFrom", () => {
  it("returns null when coordinates are missing", () => {
    expect(distanceFrom(RALEIGH, null, null)).toBeNull();
    expect(distanceFrom(RALEIGH, 35.8, null)).toBeNull();
  });
  it("returns miles + minutes + band when coordinates exist", () => {
    const d = distanceFrom(RALEIGH, 35.8101, -78.7028);
    expect(d).not.toBeNull();
    expect(d!.miles).toBeGreaterThan(0);
    expect(d!.minutes).toBeGreaterThanOrEqual(1);
    expect(d!.band).toBe("0-5");
  });
});
