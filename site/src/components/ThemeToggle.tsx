import type { Theme } from "../lib/theme";

interface Props {
  theme: Theme;
  onToggle: () => void;
}

/**
 * Sun/moon affordance for the header. Shows the icon for the theme you'd switch
 * *to* (moon while light, sun while dark) — the conventional toggle metaphor.
 */
export default function ThemeToggle({ theme, onToggle }: Props) {
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      <span aria-hidden>{isDark ? "☀️" : "🌙"}</span>
    </button>
  );
}
