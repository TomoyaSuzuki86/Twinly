import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ setPlan: vi.fn() }));
vi.mock("./family-access", () => ({ setFamilyPreviewPlan: mock.setPlan }));

import {
  changeCurrentFamilyPreviewPlan,
  clearFamilyAccessState,
  getCurrentFamilyAccessState,
  publishFamilyAccessState,
  subscribeCurrentFamilyAccess,
} from "./family-access-state";

const free = {
  plan: "free" as const,
  canPreview: true,
  features: { aiReview: false, aiChat: false, dailySummaryEmail: false },
};
const premium = {
  plan: "premium" as const,
  canPreview: true,
  features: { aiReview: true, aiChat: true, dailySummaryEmail: true },
};

describe("family access state", () => {
  afterEach(() => {
    mock.setPlan.mockReset();
    clearFamilyAccessState();
  });

  it("publishes one shared snapshot to all consumers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCurrentFamilyAccess(listener);

    publishFamilyAccessState({ key: "u1:f1", access: free, error: "" });

    expect(getCurrentFamilyAccessState()).toEqual({ key: "u1:f1", access: free, error: "" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("updates the shared snapshot immediately after a preview plan change", async () => {
    publishFamilyAccessState({ key: "u1:f1", access: free, error: "" });
    mock.setPlan.mockResolvedValue(premium);

    await changeCurrentFamilyPreviewPlan("premium");

    expect(mock.setPlan).toHaveBeenCalledWith("premium");
    expect(getCurrentFamilyAccessState()).toEqual({ key: "u1:f1", access: premium, error: "" });
  });

  it("does not overwrite a newer family session when an older plan request finishes", async () => {
    let resolvePlan: (value: typeof premium) => void = () => {};
    mock.setPlan.mockReturnValue(new Promise<typeof premium>((resolve) => { resolvePlan = resolve; }));
    publishFamilyAccessState({ key: "u1:f1", access: free, error: "" });

    const pending = changeCurrentFamilyPreviewPlan("premium");
    publishFamilyAccessState({ key: "u2:f2", access: free, error: "" });
    resolvePlan(premium);
    await pending;

    expect(getCurrentFamilyAccessState()).toEqual({ key: "u2:f2", access: free, error: "" });
  });
});
