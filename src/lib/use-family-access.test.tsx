import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canSubscribeFamilyAccessChanges: vi.fn(),
  getFamilyAccess: vi.fn(),
  subscribeFamilyAccessChanges: vi.fn(),
  clearFamilyAccessState: vi.fn(),
  getCurrentFamilyAccessState: vi.fn(),
  publishFamilyAccessState: vi.fn(),
  readCachedFamilyAccess: vi.fn(),
  useCurrentFamilyAccess: vi.fn(),
}));

vi.mock("./family-access", () => ({
  canSubscribeFamilyAccessChanges: mocks.canSubscribeFamilyAccessChanges,
  getFamilyAccess: mocks.getFamilyAccess,
  subscribeFamilyAccessChanges: mocks.subscribeFamilyAccessChanges,
}));

vi.mock("./family-access-state", () => ({
  clearFamilyAccessState: mocks.clearFamilyAccessState,
  getCurrentFamilyAccessState: mocks.getCurrentFamilyAccessState,
  publishFamilyAccessState: mocks.publishFamilyAccessState,
  readCachedFamilyAccess: mocks.readCachedFamilyAccess,
  useCurrentFamilyAccess: mocks.useCurrentFamilyAccess,
}));


import { useFamilyAccess } from "./use-family-access";

const access = {
  plan: "premium" as const,
  canPreview: true,
  features: {
    aiReview: true,
    aiChat: true,
    dailySummaryEmail: true,
  },
};

describe("useFamilyAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const state = { key: "user-1:family-1", access: null, error: "" };
    mocks.useCurrentFamilyAccess.mockReturnValue(state);
    mocks.getCurrentFamilyAccessState.mockReturnValue(state);
    mocks.readCachedFamilyAccess.mockReturnValue(null);
    mocks.getFamilyAccess.mockResolvedValue(access);
    mocks.canSubscribeFamilyAccessChanges.mockReturnValue(false);
    mocks.subscribeFamilyAccessChanges.mockReturnValue(() => {});
  });


  it("coalesces production realtime access bursts into one refresh", async () => {
    vi.useFakeTimers();
    try {
      let realtimeChange = () => {};
      mocks.canSubscribeFamilyAccessChanges.mockReturnValue(true);
      mocks.subscribeFamilyAccessChanges.mockImplementation((_familyId: string, onChange: () => void) => {
        realtimeChange = onChange;
        return () => {};
      });

      const { unmount } = renderHook(() => useFamilyAccess("user-1", "family-1"));

      act(() => {
        realtimeChange();
        realtimeChange();
        realtimeChange();
      });

      expect(mocks.getFamilyAccess).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(mocks.getFamilyAccess).toHaveBeenCalledTimes(1);

      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("loads access when realtime subscription is disabled", async () => {
    const { unmount } = renderHook(() => useFamilyAccess("user-1", "family-1"));

    expect(mocks.subscribeFamilyAccessChanges).not.toHaveBeenCalled();

    await waitFor(() => expect(mocks.getFamilyAccess).toHaveBeenCalledTimes(1));
    expect(mocks.publishFamilyAccessState).toHaveBeenCalledWith({
      key: "user-1:family-1",
      access,
      error: "",
    });

    unmount();
    expect(mocks.clearFamilyAccessState).toHaveBeenCalledWith("user-1:family-1");
  });
});
