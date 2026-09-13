export type LayoutMode = "single" | "split";

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

export const parseStoredLayoutMode = (savedLayoutMode: string | null): LayoutMode =>
  savedLayoutMode === "split" ? "split" : "single";
