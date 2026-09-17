import { renderHook, waitFor } from "@testing-library/react";
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
  beginFamilyAccessBootstrap: vi.fn(),
  completeFamilyAccessBootstrap: vi.fn(),
  failFamilyAccessBootstrap: vi.fn(),
  resetFamilyAccessBootstrap: vi.fn(),
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

vi.mock("./family-access-bootstrap", () => ({
  beginFamilyAccessBootstrap: mocks.beginFamilyAccessBootstrap,
  completeFamilyAccessBootstrap: mocks.completeFamilyAccessBootstrap,
  failFamilyAccessBootstrap: mocks.failFamilyAccessBootstrap,
  resetFamilyAccessBootstrap: mocks.resetFamilyAccessBootstrap,
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

describe("useFamilyAccess bootstrap", () => {
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

  it("loads access and completes bootstrap even when realtime subscription is disabled", async () => {
    const { unmount } = renderHook(() => useFamilyAccess("user-1", "family-1"));

    expect(mocks.beginFamilyAccessBootstrap).toHaveBeenCalledWith("user-1", "family-1");
    expect(mocks.subscribeFamilyAccessChanges).not.toHaveBeenCalled();

    await waitFor(() => expect(mocks.getFamilyAccess).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.completeFamilyAccessBootstrap).toHaveBeenCalledWith("user-1", "family-1"));
    expect(mocks.publishFamilyAccessState).toHaveBeenCalledWith({
      key: "user-1:family-1",
      access,
      error: "",
    });

    unmount();
    expect(mocks.resetFamilyAccessBootstrap).toHaveBeenCalledWith("user-1", "family-1");
  });
});
