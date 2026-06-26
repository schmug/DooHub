import { useCallback, useEffect, useState } from "react";
import { applyTheme, currentTheme, storeTheme, type Theme } from "./theme";

/**
 * Owns the active theme and keeps <html data-theme> in sync. Initial state is
 * read from the DOM (the pre-paint script in index.html already resolved it),
 * so there's no flash on mount. Only an explicit toggle is persisted — first
 * visits stay responsive to OS `prefers-color-scheme` changes until the user
 * makes a choice.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      storeTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
