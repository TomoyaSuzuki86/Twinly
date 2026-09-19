import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";

export type FamilyAccess = {
  plan: "free" | "premium";
  canPreview: boolean;
  billing?: {
    complimentary?: boolean;
    status: "not_started" | "trialing" | "expired" | "active";
    trialEndsAt: number | null;
    paidUntil: number;
    priceYen: number;
    canStartTrial: boolean;
    hasSubscription: boolean;
    cancelAtPeriodEnd: boolean;
  };
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

const developmentBillingDemo = import.meta.env.VITE_TWINLY_BILLING_DEMO === "true";

export const canSubscribeFamilyAccessChanges = () => Boolean(db) && !developmentBillingDemo;

export async function getFamilyAccess(): Promise<FamilyAccess> {
  if (!functions) throw new Error("サーバー設定がありません");
  const name = developmentBillingDemo ? "developmentGetFamilyAccess" : "getFamilyAccess";
  const call = httpsCallable<unknown, FamilyAccess>(functions, name);
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
  if (!db || developmentBillingDemo) return () => {};
  return onSnapshot(
    doc(db, "families", familyId, "services", "access"),
    onChange,
    onError
  );
}
