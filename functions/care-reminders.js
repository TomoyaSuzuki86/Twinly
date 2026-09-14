const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const FULL_ACTIVITY_RECOVERY_MINUTES = 30;

const tokyoTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const tokyoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clampPercent = (value) => Math.max(0, Math.min(100, value));
const clampActivityLimitMinutes = (value) => Math.max(30, Math.min(12 * 60, value));
const formatReminderTime = (timestamp) => tokyoTimeFormatter.format(new Date(timestamp));

const getTokyoDateParts = (timestamp) => {
  const parts = tokyoDateFormatter.formatToParts(new Date(timestamp));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
  };
};

const getDefaultActivityLimitMinutes = (birthDate, nowMs) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate || ""));
  if (!match) return 180;

  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  const now = getTokyoDateParts(nowMs);

  let completedMonths = (now.year - birthYear) * 12 + now.month - birthMonth;
  if (now.day < birthDay) completedMonths -= 1;
  if (completedMonths < 0) return 180;

  if (completedMonths < 1) return 60;
  if (completedMonths < 2) return 90;
  if (completedMonths < 3) return 120;
  if (completedMonths < 5) return 150;
  if (completedMonths < 6) return 180;
  if (completedMonths < 9) return 240;
  if (completedMonths < 10) return 270;
  if (completedMonths < 15) return 300;
  return 360;
};

const analyzeSleepEvents = (events, babyId) => {
  const markers = events
    .filter(
      (event) =>
        event?.babyId === babyId &&
        (event.type === "sleepStart" || event.type === "wake") &&
        typeof event.timestamp === "number"
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  const intervals = [];
  let currentSleepStart = null;

  for (const marker of markers) {
    if (marker.type === "sleepStart") {
      if (!currentSleepStart) currentSleepStart = marker;
      continue;
    }

    if (!currentSleepStart || marker.timestamp <= currentSleepStart.timestamp) continue;

    intervals.push({
      start: currentSleepStart.timestamp,
      end: marker.timestamp,
      startEventId: currentSleepStart.id,
      wakeEventId: marker.id,
    });
    currentSleepStart = null;
  }

  return { intervals, currentSleepStart };
};

const getCompletedActivities = (analysis) => {
  const validSleepStarts = [
    ...analysis.intervals.map((interval) => interval.start),
    ...(analysis.currentSleepStart ? [analysis.currentSleepStart.timestamp] : []),
  ].sort((left, right) => left - right);

  return analysis.intervals.flatMap((interval) => {
    const nextSleepStart = validSleepStarts.find((start) => start > interval.end);
    return nextSleepStart === undefined
      ? []
      : [{ endedAt: nextSleepStart, minutes: (nextSleepStart - interval.end) / MINUTE_MS }];
  });
};

const getAverageActivityMinutes = (analysis, nowMs, lookbackDays = 7) => {
  const cutoff = nowMs - Math.max(1, lookbackDays) * DAY_MS;
  const durations = getCompletedActivities(analysis)
    .filter((activity) => activity.endedAt >= cutoff && activity.endedAt <= nowMs)
    .map((activity) => activity.minutes);

  return durations.length
    ? durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length
    : null;
};

const buildActivityPercentAt = (analysis, atMs, limitMinutes) => {
  const normalizedLimitMinutes = clampActivityLimitMinutes(limitMinutes);
  const completedIntervals = analysis.intervals
    .filter((interval) => interval.end > interval.start && interval.end <= atMs)
    .sort((left, right) => left.start - right.start);

  if (!completedIntervals.length) return 0;

  let activityPercent = 100;
  let cursor = completedIntervals[0].start;

  for (const interval of completedIntervals) {
    if (interval.start > cursor) {
      const awakeMinutes = (interval.start - cursor) / MINUTE_MS;
      activityPercent = clampPercent(
        activityPercent + (awakeMinutes / normalizedLimitMinutes) * 100
      );
    }

    const sleepMinutes = (interval.end - interval.start) / MINUTE_MS;
    activityPercent = clampPercent(
      activityPercent - (sleepMinutes / FULL_ACTIVITY_RECOVERY_MINUTES) * 100
    );
    cursor = interval.end;
  }

  if (atMs > cursor) {
    const awakeMinutes = (atMs - cursor) / MINUTE_MS;
    activityPercent = clampPercent(
      activityPercent + (awakeMinutes / normalizedLimitMinutes) * 100
    );
  }

  return activityPercent;
};

const buildSleepReminderCandidate = ({ appState, babyId, lastSentByKey, nowMs }) => {
  if (!appState?.sleepManagementEnabled) return null;

  const events = Array.isArray(appState?.events) ? appState.events : [];
  const profile = appState?.profiles?.[babyId] ?? {};
  const analysis = analyzeSleepEvents(events, babyId);
  if (analysis.currentSleepStart) return null;

  const completedIntervals = analysis.intervals
    .filter((interval) => interval.end > interval.start && interval.end <= nowMs)
    .sort((left, right) => left.end - right.end);
  const latestInterval = completedIntervals[completedIntervals.length - 1];
  if (!latestInterval) return null;

  const eventId = String(latestInterval.wakeEventId || `wake-${latestInterval.end}`);
  const reminderKey = `${babyId}:sleep`;
  if (lastSentByKey?.[reminderKey]?.eventId === eventId) return null;

  const override = Number(profile.activityLimitMinutesOverride);
  const average = getAverageActivityMinutes(analysis, nowMs);
  const rawLimit =
    Number.isFinite(override) && override > 0
      ? override
      : average ?? getDefaultActivityLimitMinutes(profile.birthDate, nowMs);
  const limitMinutes = clampActivityLimitMinutes(rawLimit);
  const percentAtWake = buildActivityPercentAt(analysis, latestInterval.end, limitMinutes);
  const remainingPercent = Math.max(0, 100 - percentAtWake);
  const dueAt = latestInterval.end + (remainingPercent / 100) * limitMinutes * MINUTE_MS;

  return {
    babyId,
    kind: "sleep",
    reminderKey,
    displayName: profile.displayName ?? `赤ちゃん${babyId}`,
    eventId,
    occurredAt: latestInterval.end,
    dueAt,
    dueNow: dueAt <= nowMs,
  };
};

const prioritizeNotificationGroup = (group) => {
  const candidates = Array.isArray(group) ? group.filter(Boolean) : [];
  const babiesWithMilk = new Set(
    candidates.filter((candidate) => candidate.kind === "milk").map((candidate) => candidate.babyId)
  );

  return candidates.filter(
    (candidate) => !(candidate.kind === "diaper" && babiesWithMilk.has(candidate.babyId))
  );
};

const formatElapsed = (occurredAt, nowMs) => {
  const minutes = Math.max(0, Math.floor((nowMs - occurredAt) / MINUTE_MS));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}分`;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
};

const titleForCandidate = (candidate) => {
  if (candidate.kind === "milk") return `${candidate.displayName}、そろそろミルクの時間です`;
  if (candidate.kind === "sleep") return `${candidate.displayName}、そろそろ寝る時間です`;
  return `${candidate.displayName}、そろそろおむつチェック`;
};

const bodyForCandidate = (candidate, nowMs) => {
  const time = formatReminderTime(candidate.occurredAt);
  const elapsed = formatElapsed(candidate.occurredAt, nowMs);
  if (candidate.kind === "milk") return `前回 ${time} ・ ${elapsed}経過`;
  if (candidate.kind === "sleep") return `起床 ${time} ・ ${elapsed}経過`;
  return `前回交換 ${time} ・ ${elapsed}経過`;
};

const lineForCandidate = (candidate, nowMs) => {
  const time = formatReminderTime(candidate.occurredAt);
  const elapsed = formatElapsed(candidate.occurredAt, nowMs);
  if (candidate.kind === "milk") {
    return `${candidate.displayName}：ミルク（前回 ${time}・${elapsed}経過）`;
  }
  if (candidate.kind === "sleep") {
    return `${candidate.displayName}：睡眠（起床 ${time}・${elapsed}経過）`;
  }
  return `${candidate.displayName}：おむつ（前回交換 ${time}・${elapsed}経過）`;
};

const kindPriority = { milk: 0, sleep: 1, diaper: 2 };

const buildCareNotificationPayload = (group, nowMs = Date.now()) => {
  const visibleGroup = prioritizeNotificationGroup(group);
  if (!visibleGroup.length) return null;

  const ordered = [...visibleGroup].sort((left, right) => {
    const priorityDiff = (kindPriority[left.kind] ?? 99) - (kindPriority[right.kind] ?? 99);
    return priorityDiff || left.dueAt - right.dueAt;
  });

  if (ordered.length === 1) {
    const candidate = ordered[0];
    return {
      title: titleForCandidate(candidate),
      body: bodyForCandidate(candidate, nowMs),
      tag: `care-reminder-${candidate.babyId}-${candidate.kind}-${candidate.eventId}`,
      url: "/",
    };
  }

  const allSameKind = ordered.every((candidate) => candidate.kind === ordered[0].kind);
  const title = allSameKind
    ? ordered[0].kind === "milk"
      ? "そろそろミルクの時間です"
      : ordered[0].kind === "sleep"
        ? "そろそろ寝る時間です"
        : "そろそろおむつチェック"
    : titleForCandidate(ordered[0]);

  return {
    title,
    body: ordered.map((candidate) => lineForCandidate(candidate, nowMs)).join("\n"),
    tag: `care-reminder-${ordered.map((candidate) => `${candidate.babyId}-${candidate.kind}`).join("-")}`,
    url: "/",
  };
};

module.exports = {
  analyzeSleepEvents,
  buildActivityPercentAt,
  buildCareNotificationPayload,
  buildSleepReminderCandidate,
  getAverageActivityMinutes,
  getDefaultActivityLimitMinutes,
  prioritizeNotificationGroup,
};
