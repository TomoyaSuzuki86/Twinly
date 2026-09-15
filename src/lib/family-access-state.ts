import { useSyncExternalStore } from "react";
import { setFamilyPreviewPlan, type FamilyAccess } from "./family-access";

export type FamilyAccessState = {
  key: string;
  access: FamilyAccess | null;
  error: string;
};

const EMPTY_STATE: FamilyAccessState = { key: "", access: null, error: "" };
let currentState: FamilyAccessState = EMPTY_STATE;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const getCurrentFamilyAccessState = () => currentState;

export const subscribeCurrentFamilyAccess = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const publishFamilyAccessState = (state: FamilyAccessState) => {
  currentState = state;
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
