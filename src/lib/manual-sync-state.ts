export type ManualSyncSignals = {
  checking: boolean;
  routineStatus: boolean;
  syncMessage: string | undefined;
};

export const hasSyncActivity = ({ checking, routineStatus, syncMessage }: ManualSyncSignals) =>
  checking || routineStatus || Boolean(syncMessage);

export const shouldShowAutomaticSyncSpinner = (
  signals: ManualSyncSignals,
  initialLoad: boolean
) => initialLoad || hasSyncActivity(signals);

export const isSyncSettled = (signals: ManualSyncSignals) => !hasSyncActivity(signals);
