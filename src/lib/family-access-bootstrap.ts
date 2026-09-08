export type FamilyAccessBootstrapState = "idle" | "loading" | "ready" | "error";

const states = new Map<string, FamilyAccessBootstrapState>();
const listeners = new Set<() => void>();

const keyFor = (uid?: string, familyId?: string) => (uid && familyId ? `${uid}:${familyId}` : "");

const notify = () => {
  for (const listener of listeners) listener();
};

const setState = (uid: string, familyId: string, state: FamilyAccessBootstrapState) => {
  states.set(keyFor(uid, familyId), state);
  notify();
};

export const beginFamilyAccessBootstrap = (uid: string, familyId: string) => {
  setState(uid, familyId, "loading");
};

export const completeFamilyAccessBootstrap = (uid: string, familyId: string) => {
  setState(uid, familyId, "ready");
};

export const failFamilyAccessBootstrap = (uid: string, familyId: string) => {
  setState(uid, familyId, "error");
};

export const resetFamilyAccessBootstrap = (uid: string, familyId: string) => {
  states.delete(keyFor(uid, familyId));
  notify();
};

export const getFamilyAccessBootstrapState = (uid?: string, familyId?: string): FamilyAccessBootstrapState => {
  const key = keyFor(uid, familyId);
  return key ? states.get(key) ?? "idle" : "idle";
};

export const subscribeFamilyAccessBootstrap = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
