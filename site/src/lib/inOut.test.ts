import { describe, it, expect } from "vitest";
import { cycleInOut, emptyInOut, inOutCount, inOutState, matchesInOut } from "./inOut";

describe("cycleInOut", () => {
  it("cycles neutral → include → exclude → neutral", () => {
    const a = cycleInOut(emptyInOut, "comedy");
    expect(inOutState(a, "comedy")).toBe("include");
    const b = cycleInOut(a, "comedy");
    expect(b).toEqual({ include: [], exclude: ["comedy"] });
    const c = cycleInOut(b, "comedy");
    expect(c).toEqual(emptyInOut);
  });
  it("leaves other values alone", () => {
    const sel = { include: ["parks"], exclude: ["comedy"] };
    expect(cycleInOut(sel, "markets")).toEqual({ include: ["parks", "markets"], exclude: ["comedy"] });
  });
});

describe("matchesInOut", () => {
  it("matches everything when nothing is set", () => {
    expect(matchesInOut(emptyInOut, "anything")).toBe(true);
  });
  it("requires an included value when any are included", () => {
    const sel = { include: ["parks"], exclude: [] };
    expect(matchesInOut(sel, "parks")).toBe(true);
    expect(matchesInOut(sel, "comedy")).toBe(false);
  });
  it("hides excluded values and keeps the rest", () => {
    const sel = { include: [], exclude: ["comedy"] };
    expect(matchesInOut(sel, "comedy")).toBe(false);
    expect(matchesInOut(sel, "parks")).toBe(true);
  });
  it("lets exclude win over include", () => {
    expect(matchesInOut({ include: ["comedy"], exclude: ["comedy"] }, "comedy")).toBe(false);
  });
});

describe("inOutCount", () => {
  it("counts includes and excludes", () => {
    expect(inOutCount({ include: ["a", "b"], exclude: ["c"] })).toBe(3);
  });
});
