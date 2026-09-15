import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeAppStoreLifecycle, type AppStoreLifecycleTarget } from "./app-store-lifecycle";

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.restoreAllMocks();
});

const setup = () => {
  let hasPending = false;
  const target: AppStoreLifecycleTarget = {
    get hasPending() {
      return hasPending;
    },
    recheck: vi.fn(),
    flush: vi.fn(),
    refresh: vi.fn(),
  };
  const cleanup = subscribeAppStoreLifecycle({
    userId: "user-1",
    familyId: "family-1",
    getStore: () => target,
  });
  cleanups.push(cleanup);
  return { target, setHasPending: (value: boolean) => { hasPending = value; }, cleanup };
};

describe("app store browser lifecycle", () => {
  it("rechecks and flushes for online, pageshow, and visible transitions", () => {
    const { target } = setup();
    const visibility = vi.spyOn(document, "visibilityState", "get");

    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("pageshow"));

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(target.recheck).toHaveBeenNthCalledWith(1, "online");
    expect(target.recheck).toHaveBeenNthCalledWith(2, "pageshow");
    expect(target.recheck).toHaveBeenNthCalledWith(3, "visibility");
    expect(target.recheck).toHaveBeenCalledTimes(3);
    expect(target.flush).toHaveBeenCalledTimes(3);
  });

  it("refreshes only for this app store scope or a full storage clear", () => {
    const { target } = setup();

    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated:key" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "twinly-outbox:user-1:family-1:item" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "twinly-outbox:user-1:family-1.confirmed:item" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "twinly-outbox:user-1:family-1.conflict:item" }));
    window.dispatchEvent(new StorageEvent("storage", { key: null }));

    expect(target.refresh).toHaveBeenCalledTimes(4);
  });

  it("blocks unload only with pending writes and removes listeners on cleanup", () => {
    const { target, setHasPending, cleanup } = setup();

    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    setHasPending(true);
    const pendingEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(pendingEvent);
    expect(pendingEvent.defaultPrevented).toBe(true);

    cleanup();
    cleanups.pop();
    window.dispatchEvent(new Event("online"));
    expect(target.recheck).not.toHaveBeenCalled();
  });
});
