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
import {
  beginFamilyAccessBootstrap,
  completeFamilyAccessBootstrap,
  failFamilyAccessBootstrap,
  resetFamilyAccessBootstrap,
} from "./family-access-bootstrap";
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
    let finishBootstrapSync = beginBackgroundSync("family-access-bootstrap");
    const cachedAccess = readCachedFamilyAccess(key);
    publishFamilyAccessState({ key, access: cachedAccess, error: "" });
    beginFamilyAccessBootstrap(uid, familyId);

    const finishInitialSync = () => {
      finishBootstrapSync();
      finishBootstrapSync = () => {};
    };

    const refresh = () => {
      finishInitialSync();
      const currentRevision = ++revision;
      const finishSync = beginBackgroundSync("family-access");
      getFamilyAccess()
        .then((access) => {
          if (!active || currentRevision !== revision) return;
          publishFamilyAccessState({ key, access, error: "" });
          completeFamilyAccessBootstrap(uid, familyId);
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
          failFamilyAccessBootstrap(uid, familyId);
        })
        .finally(finishSync);
    };

    const realtimeEnabled = canSubscribeFamilyAccessChanges();
    const stop = realtimeEnabled
      ? subscribeFamilyAccessChanges(
          familyId,
          refresh,
          () => {
            if (!active) return;
            finishInitialSync();
            const current = getCurrentFamilyAccessState();
            publishFamilyAccessState({
              key,
              access: current.key === key ? current.access : cachedAccess,
              error: "プランの同期が停止しました。再読み込みしてください。",
            });
            failFamilyAccessBootstrap(uid, familyId);
          }
        )
      : () => {};

    // development billing demo intentionally disables Firestore realtime subscription.
    // Fetch in the background while the cached access state remains visible.
    if (!realtimeEnabled) refresh();

    const onFocus = () => { if (document.visibilityState !== "hidden") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      finishInitialSync();
      clearTimeout(expiryTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      active = false;
      stop();
      clearFamilyAccessState(key);
      resetFamilyAccessBootstrap(uid, familyId);
    };
  }, [key, uid, familyId]);

  return state.key === key ? state : EMPTY_ACCESS;
}
