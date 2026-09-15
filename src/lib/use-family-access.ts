import { useEffect } from "react";
import {
  canSubscribeFamilyAccessChanges,
  getFamilyAccess,
  subscribeFamilyAccessChanges,
} from "./family-access";
import {
  clearFamilyAccessState,
  publishFamilyAccessState,
  useCurrentFamilyAccess,
} from "./family-access-state";
import {
  beginFamilyAccessBootstrap,
  completeFamilyAccessBootstrap,
  failFamilyAccessBootstrap,
  resetFamilyAccessBootstrap,
} from "./family-access-bootstrap";

const EMPTY_ACCESS = { access: null, error: "" };

export function useFamilyAccess(uid?: string, familyId?: string) {
  const state = useCurrentFamilyAccess();
  const key = `${uid}:${familyId}`;

  useEffect(() => {
    if (!uid || !familyId || !canSubscribeFamilyAccessChanges()) {
      clearFamilyAccessState();
      return;
    }

    let active = true;
    let revision = 0;
    publishFamilyAccessState({ key, access: null, error: "" });
    beginFamilyAccessBootstrap(uid, familyId);

    const refresh = () => {
      const currentRevision = ++revision;
      getFamilyAccess()
        .then((access) => {
          if (!active || currentRevision !== revision) return;
          publishFamilyAccessState({ key, access, error: "" });
          completeFamilyAccessBootstrap(uid, familyId);
        })
        .catch(() => {
          if (!active || currentRevision !== revision) return;
          publishFamilyAccessState({
            key,
            access: null,
            error: "プランを確認できません。再読み込みしてください。",
          });
          failFamilyAccessBootstrap(uid, familyId);
        });
    };

    const stop = subscribeFamilyAccessChanges(
      familyId,
      refresh,
      () => {
        if (!active) return;
        publishFamilyAccessState({
          key,
          access: null,
          error: "プランの同期が停止しました。再読み込みしてください。",
        });
        failFamilyAccessBootstrap(uid, familyId);
      }
    );

    return () => {
      active = false;
      stop();
      clearFamilyAccessState(key);
      resetFamilyAccessBootstrap(uid, familyId);
    };
  }, [key, uid, familyId]);

  return state.key === key ? state : EMPTY_ACCESS;
}
