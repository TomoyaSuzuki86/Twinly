export type AppStoreLifecycleReason = "online" | "visibility" | "pageshow";

export type AppStoreLifecycleTarget = {
  readonly hasPending: boolean;
  recheck: (reason: AppStoreLifecycleReason) => void;
  flush: () => void | Promise<unknown>;
  refresh: () => void;
};

type SubscribeAppStoreLifecycleOptions = {
  userId: string;
  familyId: string;
  getStore: () => AppStoreLifecycleTarget | null;
};

export const subscribeAppStoreLifecycle = ({
  userId,
  familyId,
  getStore,
}: SubscribeAppStoreLifecycleOptions) => {
  const recheck = (reason: AppStoreLifecycleReason) => {
    getStore()?.recheck(reason);
    void getStore()?.flush();
  };

  const onOnline = () => recheck("online");
  const onVisible = () => {
    if (document.visibilityState === "visible") recheck("visibility");
  };
  const onPageShow = () => recheck("pageshow");
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!getStore()?.hasPending) return;
    event.preventDefault();
    event.returnValue = "";
  };

  const scopeKey = `twinly-outbox:${userId}:${familyId}`;
  const outboxPrefix = `${scopeKey}:`;
  const confirmedPrefix = `${scopeKey}.confirmed:`;
  const conflictPrefix = `${scopeKey}.conflict:`;
  const refresh = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key.startsWith(outboxPrefix) ||
      event.key.startsWith(confirmedPrefix) ||
      event.key.startsWith(conflictPrefix)
    ) {
      getStore()?.refresh();
    }
  };

  window.addEventListener("storage", refresh);
  window.addEventListener("online", onOnline);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("beforeunload", beforeUnload);

  return () => {
    window.removeEventListener("storage", refresh);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("beforeunload", beforeUnload);
  };
};
