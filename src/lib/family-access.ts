import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";

export type FamilyAccess = {
  plan: "free" | "premium";
  canPreview: boolean;
  features: {
    aiReview: boolean;
    aiChat: boolean;
    dailySummaryEmail: boolean;
    themes?: boolean;
    gauges?: boolean;
    careNotifications?: boolean;
    stockForecast?: boolean;
    stockNotifications?: boolean;
    familySharing?: boolean;
    music?: boolean;
  };
};

export const canSubscribeFamilyAccessChanges = () => Boolean(db);

export async function getFamilyAccess(): Promise<FamilyAccess> {
  if (!functions) throw new Error("サーバー設定がありません");
  const call = httpsCallable<unknown, FamilyAccess>(functions, "getFamilyAccess");
  return (await call({})).data;
}

export async function setFamilyPreviewPlan(plan: "free" | "premium"): Promise<FamilyAccess> {
  if (!functions) throw new Error("サーバー設定がありません");
  const call = httpsCallable<{ plan: "free" | "premium" }, FamilyAccess>(functions, "setFamilyPreviewPlan");
  return (await call({ plan })).data;
}

export function subscribeFamilyAccessChanges(
  familyId: string,
  onChange: () => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, "families", familyId, "services", "access"),
    onChange,
    onError
  );
}
