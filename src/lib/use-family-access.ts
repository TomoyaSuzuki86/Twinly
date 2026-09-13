import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { callService, FamilyAccess } from "./ai";
import {
  beginFamilyAccessBootstrap,
  completeFamilyAccessBootstrap,
  failFamilyAccessBootstrap,
  resetFamilyAccessBootstrap,
} from "./family-access-bootstrap";

type FamilyAccessState = {
  key: string;
  access: FamilyAccess | null;
  error: string;
};

const EMPTY_ACCESS = { access: null, error: "" };

export function useFamilyAccess(uid?: string, familyId?: string) {
  const [state, setState] = useState<FamilyAccessState>({
    key: "",
    access: null,
    error: "",
  });
  const key = `${uid}:${familyId}`;

  useEffect(() => {
    if (!uid || !familyId || !db) return;

    let active = true;
    let revision = 0;
    beginFamilyAccessBootstrap(uid, familyId);

    const refresh = () => {
      const currentRevision = ++revision;
      callService<FamilyAccess>("getFamilyAccess")
        .then((access) => {
          if (!active || currentRevision !== revision) return;
          setState({ key, access, error: "" });
          completeFamilyAccessBootstrap(uid, familyId);
        })
        .catch(() => {
          if (!active || currentRevision !== revision) return;
          setState({
            key,
            access: null,
            error: "プランを確認できません。再読み込みしてください。",
          });
          failFamilyAccessBootstrap(uid, familyId);
        });
    };

    const stop = onSnapshot(
      doc(db, "families", familyId, "services", "access"),
      refresh,
      () => {
        if (!active) return;
        setState({
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
      resetFamilyAccessBootstrap(uid, familyId);
    };
  }, [key, uid, familyId]);

  return state.key === key ? state : EMPTY_ACCESS;
}
