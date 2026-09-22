import type { BabyId, LogEvent } from "@/types";

export type CareReminderKind = "milk" | "diaper" | "sleep";

export type CareReminderMarker = {
  babyId: BabyId;
  kind: CareReminderKind;
  eventId: string;
  occurredAt: number;
};

const isCareReminderMarker = (value: unknown): value is CareReminderMarker => {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<CareReminderMarker>;
  return (
    (marker.babyId === "A" || marker.babyId === "B") &&
    (marker.kind === "milk" || marker.kind === "diaper" || marker.kind === "sleep") &&
    typeof marker.eventId === "string" &&
    typeof marker.occurredAt === "number"
  );
};

export const isCareReminderResolved = (
  reminder: CareReminderMarker,
  events: LogEvent[]
) => {
  const resolvingType = reminder.kind === "sleep" ? "sleepStart" : reminder.kind;

  return events.some(
    (event) =>
      event.babyId === reminder.babyId &&
      event.type === resolvingType &&
      event.id !== reminder.eventId &&
      event.timestamp >= reminder.occurredAt
  );
};

const LEGACY_GROUP_TAG =
  /^care-reminder-(?:A|B)-(?:milk|diaper|sleep)-(?:A|B)-(?:milk|diaper|sleep)(?:-|$)/;
const LEGACY_SINGLE_TAG = /^care-reminder-(A|B)-(milk|diaper|sleep)-(.+)$/;

export const careReminderFromLegacyTag = (
  tag: string,
  events: LogEvent[]
): CareReminderMarker | null => {
  if (LEGACY_GROUP_TAG.test(tag)) return null;
  const match = tag.match(LEGACY_SINGLE_TAG);
  if (!match) return null;

  const [, babyId, kind, eventId] = match as [
    string,
    BabyId,
    CareReminderKind,
    string,
  ];
  const sourceType = kind === "sleep" ? "wake" : kind;
  const sourceEvent = events.find(
    (event) =>
      event.id === eventId &&
      event.babyId === babyId &&
      event.type === sourceType
  );
  if (!sourceEvent) return null;

  return {
    babyId,
    kind,
    eventId,
    occurredAt: sourceEvent.timestamp,
  };
};

const getCareReminderMarkers = (
  notification: Notification,
  events: LogEvent[]
): CareReminderMarker[] => {
  const data = notification.data as
    | {
        careReminder?: unknown;
        careReminders?: unknown;
      }
    | undefined;

  if (isCareReminderMarker(data?.careReminder)) return [data.careReminder];
  if (Array.isArray(data?.careReminders)) {
    const reminders = data.careReminders.filter(isCareReminderMarker);
    if (reminders.length > 0) return reminders;
  }

  const legacyReminder = careReminderFromLegacyTag(notification.tag, events);
  return legacyReminder ? [legacyReminder] : [];
};

export const reconcileDisplayedCareNotifications = async (events: LogEvent[]) => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications();

    for (const notification of notifications) {
      const reminders = getCareReminderMarkers(notification, events);
      if (reminders.length > 0 && reminders.every((reminder) => isCareReminderResolved(reminder, events))) {
        notification.close();
      }
    }
  } catch (error) {
    console.warn("Failed to reconcile care notifications", error);
  }
};
