// Theme resolution + persistence for the light/dark toggle.
//
// The actual values for each theme live in index.css under `:root` (light) and
// `[data-theme="dark"]`. This module only decides *which* theme is active and
// reflects it onto <html data-theme>. The pre-paint inline script in index.html
// runs the same `resolveInitialTheme` logic before first paint to avoid a flash
// of the wrong theme; this module then takes over once React mounts.

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** Whether a stored/raw value is a theme we recognise. */
function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * Resolve the theme to use given a stored preference and the OS preference.
 * Pure + dependency-free so it's unit-testable and can be inlined in the
 * pre-paint script. An explicit stored choice wins; otherwise fall back to the
 * `prefers-color-scheme` signal; default light.
 */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersDark ? "dark" : "light";
}

/** Read the persisted theme choice, tolerating disabled/throwing storage. */
export function getStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persist an explicit theme choice (no-op if storage is unavailable). */
export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore — private mode / blocked storage */
  }
}

/** True when the OS asks for a dark colour scheme. */
export function prefersDark(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/**
 * The theme currently in effect. The pre-paint script already set
 * <html data-theme>; trust it when present, otherwise resolve from scratch.
 */
export function currentTheme(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.dataset.theme;
    if (isTheme(attr)) return attr;
  }
  return resolveInitialTheme(getStoredTheme(), prefersDark());
}

/** Reflect the active theme onto <html data-theme> so the CSS tokens flip. */
export function applyTheme(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
}
