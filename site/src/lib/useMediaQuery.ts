import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query from React.
 *
 * The selection sidebar needs this rather than CSS alone: at compact widths its
 * header becomes a real expand/collapse control, and `aria-expanded` would lie
 * to screen readers on desktop where the list is always shown. Guarded on
 * `matchMedia` so a missing implementation degrades to "no match" instead of
 * throwing on mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    // Belt-and-braces: if the media-query event is ever missed, React's idea of
    // the layout desyncs from the CSS's and the sheet's header stops being the
    // button that opens it. A resize listener re-reads the same source of truth;
    // an unchanged value is a no-op re-render React bails out of.
    window.addEventListener("resize", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [query]);

  return matches;
}
