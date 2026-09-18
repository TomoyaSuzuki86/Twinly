import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authListener: null as null | ((user: unknown) => void),
  onAuthStateChanged: vi.fn(),
  ensureAuthPersistence: vi.fn(async () => {}),
}));

vi.mock("@/firebase", () => ({
  auth: { currentUser: null },
  ensureAuthPersistence: mocks.ensureAuthPersistence,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class GoogleAuthProvider {
    static credential = vi.fn();
  },
  isSignInWithEmailLink: vi.fn(() => false),
  onAuthStateChanged: mocks.onAuthStateChanged.mockImplementation((_auth: unknown, listener: (user: unknown) => void) => {
    mocks.authListener = listener;
    return () => {};
  }),
  sendSignInLinkToEmail: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmailLink: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

import { useAuthentication } from "./use-authentication";

beforeEach(() => {
  mocks.authListener = null;
  mocks.onAuthStateChanged.mockClear();
  mocks.ensureAuthPersistence.mockClear();
});

it("marks authentication ready without waiting for family/session follow-up", async () => {
  let resolveFollowUp = () => {};
  const followUp = new Promise<void>((resolve) => {
    resolveFollowUp = resolve;
  });
  const onUserChanged = vi.fn(() => followUp);
  const { result } = renderHook(() => useAuthentication({ inviteToken: "", onUserChanged }));

  await vi.waitFor(() => expect(mocks.authListener).not.toBeNull());

  const user = { uid: "user-1", displayName: "Parent" };
  act(() => mocks.authListener?.(user));

  expect(result.current.user).toBe(user);
  expect(result.current.ready).toBe(true);
  expect(onUserChanged).toHaveBeenCalledTimes(1);

  await act(async () => resolveFollowUp());
});
