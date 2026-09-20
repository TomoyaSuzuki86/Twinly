export type LayoutMode = "single" | "split";

export const WIDE_SPLIT_LAYOUT_MIN_WIDTH_PX = 1180;
export const WIDE_SPLIT_LAYOUT_QUERY = `(min-width: ${WIDE_SPLIT_LAYOUT_MIN_WIDTH_PX}px)`;
// CSS media queries in theme-polish.css and primary-action-morph.css mirror this breakpoint.

const LEGACY_THEME_ALIASES: Record<string, string> = {
  light: "milk",
  pink: "sakura",
  yellow: "sun",
};

const PREMIUM_THEMES = new Set(["sakura", "sun", "forest"]);

export const normalizeStoredTheme = (savedTheme: string | null) => {
  const theme = savedTheme || "dark";
  return LEGACY_THEME_ALIASES[theme] ?? theme;
};

export const resolveAppliedTheme = (theme: string, premiumThemesEnabled: boolean) => {
  if (theme === "milk") return theme;
  if (PREMIUM_THEMES.has(theme) && premiumThemesEnabled) return theme;
  return "dark";
};

export const parseStoredLayoutMode = (savedLayoutMode: string | null): LayoutMode => {
  if (savedLayoutMode === "single" || savedLayoutMode === "split") return savedLayoutMode;
  return "split";
};
