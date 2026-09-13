import { useEffect, useState } from "react";
import {
  LayoutMode,
  normalizeStoredTheme,
  parseStoredLayoutMode,
  resolveAppliedTheme,
} from "./appearance-preferences";

export function useAppearancePreferences(familyId?: string, premiumThemesEnabled = false) {
  const [theme, setTheme] = useState("dark");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("single");

  useEffect(() => {
    if (!familyId) return;
    try {
      setTheme(normalizeStoredTheme(localStorage.getItem(`twinly-theme:${familyId}`)));
    } catch {
      setTheme("dark");
    }
  }, [familyId]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolveAppliedTheme(theme, premiumThemesEnabled);
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
      setLayoutMode(parseStoredLayoutMode(localStorage.getItem(`twinly-layout:${familyId}`)));
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
