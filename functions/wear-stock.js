const BABY_IDS = ["A", "B"];

const setSharedStock = (profiles, size, stock) => {
  const nextProfiles = { ...(profiles || {}) };
  for (const id of BABY_IDS) {
    const currentProfile = nextProfiles[id];
    if (!currentProfile) continue;
    nextProfiles[id] = {
      ...currentProfile,
      diaperStockBySize: {
        ...(currentProfile.diaperStockBySize || {}),
        [size]: Math.max(0, stock),
      },
    };
  }
  return nextProfiles;
};

const consumeWearDiaperStock = (appState, event) => {
  if (appState.diaperStockManagementEnabled === false) return appState;
  const profile = appState.profiles?.[event.babyId];
  const selectedSize = profile?.diaperSize;
  const currentStock = selectedSize
    ? profile?.diaperStockBySize?.[selectedSize] ?? 0
    : null;
  if (!selectedSize || currentStock === null) return appState;

  event.diaperSizeUsed = selectedSize;
  event.diaperStockConsumed = Math.min(1, Math.max(0, currentStock));
  return {
    ...appState,
    profiles: setSharedStock(appState.profiles, selectedSize, currentStock - 1),
  };
};

const restoreWearDiaperStock = (appState, event) => {
  const selectedSize = event.diaperSizeUsed;
  if (!selectedSize || !event.diaperStockConsumed) return appState;
  const profile = appState.profiles?.[event.babyId];
  const currentStock = profile?.diaperStockBySize?.[selectedSize] ?? 0;
  return {
    ...appState,
    profiles: setSharedStock(
      appState.profiles,
      selectedSize,
      currentStock + event.diaperStockConsumed
    ),
  };
};

module.exports = {
  consumeWearDiaperStock,
  restoreWearDiaperStock,
};
