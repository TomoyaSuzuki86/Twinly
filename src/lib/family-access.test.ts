import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  httpsCallable: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock("@/firebase", () => ({ db: { id: "db" }, functions: { id: "functions" } }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.httpsCallable }));
vi.mock("firebase/firestore", () => ({ doc: mocks.doc, onSnapshot: mocks.onSnapshot }));

import {
  canSubscribeFamilyAccessChanges,
  getFamilyAccess,
  setFamilyPreviewPlan,
  subscribeFamilyAccessChanges,
} from "./family-access";

const developmentBillingDemo = import.meta.env.VITE_TWINLY_BILLING_DEMO === "true";

const access = {
  plan: "premium" as const,
  canPreview: true,
  features: {
    aiReview: true,
    aiChat: true,
    dailySummaryEmail: true,
  },
};

describe("family access provider boundary", () => {
  beforeEach(() => {
    mocks.callable.mockReset();
    mocks.httpsCallable.mockReset();
    mocks.doc.mockReset();
    mocks.onSnapshot.mockReset();
    mocks.callable.mockResolvedValue({ data: access });
    mocks.httpsCallable.mockReturnValue(mocks.callable);
    mocks.doc.mockImplementation((...parts: unknown[]) => parts);
    mocks.onSnapshot.mockReturnValue(() => {});
  });

  it("loads access through the named callable", async () => {
    await expect(getFamilyAccess()).resolves.toEqual(access);
    expect(mocks.httpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      developmentBillingDemo ? "developmentGetFamilyAccess" : "getFamilyAccess"
    );
    expect(mocks.callable).toHaveBeenCalledWith({});
  });

  it("changes preview plan through the named callable", async () => {
    await expect(setFamilyPreviewPlan("free")).resolves.toEqual(access);
    expect(mocks.httpsCallable).toHaveBeenCalledWith(expect.anything(), "setFamilyPreviewPlan");
    expect(mocks.callable).toHaveBeenCalledWith({ plan: "free" });
  });

  it("owns the realtime access document path outside development billing demo", () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    const stop = subscribeFamilyAccessChanges("family-1", onChange, onError);

    expect(canSubscribeFamilyAccessChanges()).toBe(!developmentBillingDemo);
    expect(stop).toEqual(expect.any(Function));

    if (developmentBillingDemo) {
      expect(mocks.doc).not.toHaveBeenCalled();
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
      return;
    }

    expect(mocks.doc).toHaveBeenCalledWith(expect.anything(), "families", "family-1", "services", "access");
    expect(mocks.onSnapshot).toHaveBeenCalledWith(expect.anything(), onChange, onError);
  });
});
