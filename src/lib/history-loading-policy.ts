const DAY_MS = 24 * 60 * 60 * 1000;

export const RECENT_HISTORY_DAYS = 30;
export const HISTORY_PREFETCH_MARGIN_DAYS = 4;

export type CompleteHistoryReasonState = {
  chartOpen: boolean;
  dailyReportOpen: boolean;
  timelineOpen: boolean;
  historyOpen: boolean;
  settingsOpen: boolean;
};

export const shouldLoadCompleteHistory = ({
  activeDate,
  now,
  overlays,
}: {
  activeDate: string;
  now: Date;
  overlays: CompleteHistoryReasonState;
}) => {
  if (
    overlays.chartOpen ||
    overlays.dailyReportOpen ||
    overlays.timelineOpen ||
    overlays.historyOpen ||
    overlays.settingsOpen
  ) {
    return true;
  }

  const activeDay = new Date(`${activeDate}T00:00:00`).getTime();
  return activeDay < now.getTime() - (RECENT_HISTORY_DAYS - HISTORY_PREFETCH_MARGIN_DAYS) * DAY_MS;
};
