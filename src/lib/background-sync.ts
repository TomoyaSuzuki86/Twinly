const activeSyncs = new Set<symbol>();

const applyPresentation = () => {
  if (typeof document === "undefined") return;
  if (activeSyncs.size > 0) {
    document.documentElement.dataset.twinlyBackgroundSyncing = "true";
  } else {
    delete document.documentElement.dataset.twinlyBackgroundSyncing;
  }
};

export const beginBackgroundSync = (label: string) => {
  const token = Symbol(label);
  activeSyncs.add(token);
  applyPresentation();
  let finished = false;

  return () => {
    if (finished) return;
    finished = true;
    activeSyncs.delete(token);
    applyPresentation();
  };
};

export const isBackgroundSyncing = () => activeSyncs.size > 0;
