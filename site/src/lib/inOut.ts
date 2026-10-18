/**
 * Include / exclude ("in / out") selection for a chip facet such as category
 * or city. Each value is neutral, included (must match) or excluded (hidden).
 */
export interface InOut {
  include: string[];
  exclude: string[];
}

export type InOutState = "neutral" | "include" | "exclude";

export const emptyInOut: InOut = { include: [], exclude: [] };

export function inOutState(sel: InOut, value: string): InOutState {
  if (sel.include.includes(value)) return "include";
  if (sel.exclude.includes(value)) return "exclude";
  return "neutral";
}

/** Advance one value through neutral → include → exclude → neutral. */
export function cycleInOut(sel: InOut, value: string): InOut {
  const include = sel.include.filter((v) => v !== value);
  const exclude = sel.exclude.filter((v) => v !== value);
  switch (inOutState(sel, value)) {
    case "neutral":
      return { include: [...include, value], exclude };
    case "include":
      return { include, exclude: [...exclude, value] };
    default:
      return { include, exclude };
  }
}

/**
 * Exclude wins: an excluded value never matches. With any includes set, the
 * value must be one of them; with none, everything not excluded matches.
 */
export function matchesInOut(sel: InOut, value: string): boolean {
  if (sel.exclude.includes(value)) return false;
  return sel.include.length === 0 || sel.include.includes(value);
}

export function inOutCount(sel: InOut): number {
  return sel.include.length + sel.exclude.length;
}
