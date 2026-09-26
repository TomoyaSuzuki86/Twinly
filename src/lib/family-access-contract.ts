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
