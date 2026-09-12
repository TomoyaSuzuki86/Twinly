import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { createInitialAppState } from "@/lib/app-state";
import { appendEvents } from "@/lib/event-mutations";
import type { AppSnapshot } from "./app-repository";

const mock = vi.hoisted(() => ({ callbacks: [] as Array<(snapshot: AppSnapshot) => void> }));
vi.mock("@/firebase", () => ({ db: {} }));
vi.mock("@/lib/family-access-bootstrap", () => ({
  getFamilyAccessBootstrapState: () => "ready",
  subscribeFamilyAccessBootstrap: () => () => {},
}));
vi.mock("./firestore-app-repository", () => ({
  createFirestoreAppRepository: () => ({
    subscribe: (callback: (snapshot: AppSnapshot) => void) => { mock.callbacks.push(callback); return () => {}; },
    commit: vi.fn(),
    loadLatest: vi.fn(),
    loadAll: vi.fn(),
  }),
}));
import { useAppStore } from "./use-app-store";

afterEach(() => { cleanup(); localStorage.clear(); mock.callbacks = []; });

it("keeps the current visible records while expanding from recent history to all history", () => {
  const server = appendEvents(createInitialAppState(), [
    { id: "kanata-170", babyId: "A", type: "milk", timestamp: 1000, milkMl: 170 },
  ]);
  const { result, rerender } = renderHook(({ allHistory }) => {
    const [app, setApp] = useState(createInitialAppState);
    const [loading, setLoading] = useState(true);
    const { status } = useAppStore("test-user", "test-family", allHistory, setApp, setLoading);
    return { app, loading, status };
  }, { initialProps: { allHistory: false } });

  act(() => mock.callbacks[0]({ app: server, fromCache: false, completeHistory: false }));
  expect(result.current.app.events).toHaveLength(1);
  expect(result.current.loading).toBe(false);
  expect(result.current.status.ready).toBe(true);

  rerender({ allHistory: true });
  expect(mock.callbacks).toHaveLength(2);
  expect(result.current.app.events).toHaveLength(1);
  expect(result.current.loading).toBe(false);
  expect(result.current.status.ready).toBe(true);

  act(() => mock.callbacks[1]({ app: server, fromCache: false, completeHistory: true }));
  expect(result.current.app.events).toHaveLength(1);
});