import { useSyncExternalStore } from "react";
import { setFamilyPreviewPlan, type FamilyAccess } from "./family-access";

export type FamilyAccessState = {
  key: string;
  access: FamilyAccess | null;
  error: string;
};

type CachedFamilyAccess = {
  access: FamilyAccess;
  cachedAt: number;
};

const EMPTY_STATE: FamilyAccessState = { key: "", access: null, error: "" };
const FAMILY_ACCESS_CACHE_PREFIX = "twinly-family-access:";
let currentState: FamilyAccessState = EMPTY_STATE;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());
const cacheKey = (key: string) => `${FAMILY_ACCESS_CACHE_PREFIX}${key}`;

const isFamilyAccess = (value: unknown): value is FamilyAccess => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FamilyAccess>;
  return Boolean(
    (candidate.plan === "free" || candidate.plan === "premium") &&
    candidate.features &&
    typeof candidate.features === "object"
  );
};

export const readCachedFamilyAccess = (key: string): FamilyAccess | null => {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedFamilyAccess>;
    if (!isFamilyAccess(parsed.access)) {
      window.localStorage.removeItem(cacheKey(key));
      return null;
    }
    return parsed.access;
  } catch {
    return null;
  }
};

const writeCachedFamilyAccess = (key: string, access: FamilyAccess) => {
  if (!key || typeof window === "undefined") return;
  try {
    const cached: CachedFamilyAccess = { access, cachedAt: Date.now() };
    window.localStorage.setItem(cacheKey(key), JSON.stringify(cached));
  } catch {
    // Entitlement cache only accelerates rendering; the server remains authoritative.
  }
};

export const getCurrentFamilyAccessState = () => currentState;

export const subscribeCurrentFamilyAccess = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const publishFamilyAccessState = (state: FamilyAccessState) => {
  currentState = state;
  if (state.key && state.access) writeCachedFamilyAccess(state.key, state.access);
  emit();
};

export const clearFamilyAccessState = (key?: string) => {
  if (key && currentState.key !== key) return;
  if (currentState === EMPTY_STATE) return;
  currentState = EMPTY_STATE;
  emit();
};

export const useCurrentFamilyAccess = () =>
  useSyncExternalStore(
    subscribeCurrentFamilyAccess,
    getCurrentFamilyAccessState,
    getCurrentFamilyAccessState
  );

export async function changeCurrentFamilyPreviewPlan(plan: "free" | "premium") {
  const key = currentState.key;
  const access = await setFamilyPreviewPlan(plan);
  if (key && currentState.key === key) {
    publishFamilyAccessState({ key, access, error: "" });
  }
  return access;
}
