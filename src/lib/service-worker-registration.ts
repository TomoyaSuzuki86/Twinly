let currentCleanup: (() => void) | null = null;

export const installServiceWorkerRegistration = () => {
  currentCleanup?.();

  if (!("serviceWorker" in navigator)) return () => {};

  let disposed = false;
  let controllerChangeHandler: (() => void) | null = null;
  let focusHandler: (() => void) | null = null;
  let visibilityHandler: (() => void) | null = null;

  const handleLoad = async () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;

    if (hadController) {
      controllerChangeHandler = () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", controllerChangeHandler);
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });
      if (disposed) return;

      const checkForUpdate = () => {
        registration.update().catch((error) => {
          console.warn("Service worker update check failed", error);
        });
      };

      focusHandler = checkForUpdate;
      visibilityHandler = () => {
        if (document.visibilityState === "visible") checkForUpdate();
      };

      checkForUpdate();
      window.addEventListener("focus", focusHandler);
      document.addEventListener("visibilitychange", visibilityHandler);
    } catch (error) {
      if (!disposed) console.error("Service worker registration failed", error);
    }
  };

  void handleLoad();

  const cleanup = () => {
    disposed = true;
    if (controllerChangeHandler) {
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChangeHandler);
    }
    if (focusHandler) window.removeEventListener("focus", focusHandler);
    if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
    if (currentCleanup === cleanup) currentCleanup = null;
  };

  currentCleanup = cleanup;
  return cleanup;
};
