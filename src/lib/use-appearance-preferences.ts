import { useEffect, useState } from "react";

export type LayoutMode = "single" | "split";

const normalizeTheme = (savedTheme: string | null) => {
  const theme = savedTheme || "dark";
  if (theme === "light") return "milk";
  if (theme === "pink") return "sakura";
  if (theme === "yellow") return "sun";
  return theme;
};

export function useAppearancePreferences(familyId?: string, premiumThemesEnabled = false) {
  const [theme, setTheme] = useState("dark");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("single");

  useEffect(() => {
    if (!familyId) return;
    try {
      setTheme(normalizeTheme(localStorage.getItem(`twinly-theme:${familyId}`)));
    } catch {
      setTheme("dark");
    }
  }, [familyId]);

  useEffect(() => {
    const freeTheme = theme === "milk";
    const premiumTheme = ["sakura", "sun", "forest"].includes(theme) && premiumThemesEnabled;
    document.documentElement.dataset.theme = freeTheme || premiumTheme ? theme : "dark";
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme, premiumThemesEnabled]);

  useEffect(() => {
    if (!familyId) {
      setLayoutMode("single");
      return;
    }
    try {
      setLayoutMode(localStorage.getItem(`twinly-layout:${familyId}`) === "split" ? "split" : "single");
    } catch {
      setLayoutMode("single");
    }
  }, [familyId]);

  useEffect(() => {
    document.documentElement.dataset.twinlyLayout = layoutMode;
    return () => {
      delete document.documentElement.dataset.twinlyLayout;
    };
  }, [layoutMode]);

  const selectTheme = (nextTheme: string) => {
    setTheme(nextTheme);
    if (!familyId) return;
    try {
      localStorage.setItem(`twinly-theme:${familyId}`, nextTheme);
    } catch {}
  };

  const selectLayoutMode = (nextLayoutMode: LayoutMode) => {
    setLayoutMode(nextLayoutMode);
    if (!familyId) return;
    try {
      localStorage.setItem(`twinly-layout:${familyId}`, nextLayoutMode);
    } catch {}
  };

  return { theme, layoutMode, selectTheme, selectLayoutMode };
}
