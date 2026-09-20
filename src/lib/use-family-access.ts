import { useEffect } from "react";
import {
  canSubscribeFamilyAccessChanges,
  getFamilyAccess,
  subscribeFamilyAccessChanges,
} from "./family-access";
import {
  clearFamilyAccessState,
  getCurrentFamilyAccessState,
  publishFamilyAccessState,
  readCachedFamilyAccess,
  useCurrentFamilyAccess,
} from "./family-access-state";
import { beginBackgroundSync } from "./background-sync";

const EMPTY_ACCESS = { access: null, error: "" };

export function useFamilyAccess(uid?: string, familyId?: string) {
  const state = useCurrentFamilyAccess();
  const key = `${uid}:${familyId}`;

  useEffect(() => {
    if (!uid || !familyId) {
      clearFamilyAccessState();
      return;
    }

    let active = true;
    let revision = 0;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshInFlight = false;
    let refreshQueued = false;
    let finishBootstrapSync = beginBackgroundSync("family-access-bootstrap");
    const cachedAccess = readCachedFamilyAccess(key);
    publishFamilyAccessState({ key, access: cachedAccess, error: "" });

    const finishInitialSync = () => {
      finishBootstrapSync();
      finishBootstrapSync = () => {};
    };

    const scheduleRefresh = (delay = 80) => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        refresh();
      }, delay);
    };

    const refresh = () => {
      finishInitialSync();
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;
      refreshQueued = false;
      const currentRevision = ++revision;
      const finishSync = beginBackgroundSync("family-access");
      getFamilyAccess()
        .then((access) => {
          if (!active || currentRevision !== revision) return;
          publishFamilyAccessState({ key, access, error: "" });
          clearTimeout(expiryTimer);
          const expires = access.billing?.status === "trialing" ? access.billing.trialEndsAt : access.billing?.paidUntil;
          if (expires && expires > Date.now()) expiryTimer = setTimeout(refresh, Math.min(expires - Date.now() + 100, 2147483647));
        })
        .catch(() => {
          if (!active || currentRevision !== revision) return;
          const current = getCurrentFamilyAccessState();
          publishFamilyAccessState({
            key,
            access: current.key === key ? current.access : cachedAccess,
            error: "プランを確認できません。再読み込みしてください。",
          });
        })
        .finally(() => {
          refreshInFlight = false;
          finishSync();
          if (active && refreshQueued) scheduleRefresh();
        });
    };

    const realtimeEnabled = canSubscribeFamilyAccessChanges();
    const stop = realtimeEnabled
      ? subscribeFamilyAccessChanges(
          familyId,
          () => scheduleRefresh(),
          () => {
            if (!active) return;
            finishInitialSync();
            const current = getCurrentFamilyAccessState();
            publishFamilyAccessState({
              key,
              access: current.key === key ? current.access : cachedAccess,
              error: "プランの同期が停止しました。再読み込みしてください。",
            });
          }
        )
      : () => {};

    // development billing demo intentionally disables Firestore realtime subscription.
    // Fetch in the background while the cached access state remains visible.
    if (!realtimeEnabled) refresh();

    const onFocus = () => { if (document.visibilityState !== "hidden") scheduleRefresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      finishInitialSync();
      clearTimeout(expiryTimer);
      clearTimeout(refreshTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      active = false;
      stop();
      clearFamilyAccessState(key);
    };
  }, [key, uid, familyId]);

  return state.key === key ? state : EMPTY_ACCESS;
}
