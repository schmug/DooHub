import { describe, it, expect } from "vitest";
import { resolveInitialTheme } from "./theme";

describe("resolveInitialTheme", () => {
  it("honours an explicit stored 'dark' choice over the OS preference", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });
  it("honours an explicit stored 'light' choice over the OS preference", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
  });
  it("falls back to the OS preference when nothing is stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });
  it("ignores unrecognised stored values and uses the OS preference", () => {
    expect(resolveInitialTheme("midnight", true)).toBe("dark");
    expect(resolveInitialTheme("", false)).toBe("light");
  });
  it("defaults to light when nothing is stored and the OS has no dark preference", () => {
    expect(resolveInitialTheme(null, false)).toBe("light");
  });
});
