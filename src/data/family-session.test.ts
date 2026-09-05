import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
const api = vi.hoisted(() => ({ getDoc: vi.fn(), call: vi.fn() }));
vi.mock("@/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore", () => ({ doc: (...args: unknown[]) => args, getDoc: api.getDoc, getDocFromServer: api.getDoc,
  collection: vi.fn(), onSnapshot: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => api.call }));
import { loadFamilySession } from "@/lib/family";
const user = { uid: "user", displayName: "とも" } as User;
beforeEach(() => vi.resetAllMocks());
describe("family session failures", () => {
  it("propagates a failed migration call instead of showing registration", async () => {
    api.getDoc.mockResolvedValue({ data: () => ({}) });
    api.call.mockRejectedValue(new Error("unavailable"));
    await expect(loadFamilySession(user)).rejects.toThrow("unavailable");
  });
  it("shows registration only for an explicitly confirmed new account", async () => {
    api.getDoc.mockResolvedValue({ data: () => ({}) });
    api.call.mockResolvedValue({ data: { familyId: null } });
    expect(await loadFamilySession(user)).toBeNull();
  });
  it("does not treat an inactive membership as a new account", async () => {
    api.getDoc.mockResolvedValueOnce({ data: () => ({ activeFamilyId: "family" }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({}) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ status: "inactive" }) });
    await expect(loadFamilySession(user)).rejects.toThrow("アクセス権");
  });
});
