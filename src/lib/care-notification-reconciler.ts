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

const getCareReminderMarkers = (notification: Notification): CareReminderMarker[] => {
  const data = notification.data as
    | {
        careReminder?: unknown;
        careReminders?: unknown;
      }
    | undefined;

  if (isCareReminderMarker(data?.careReminder)) return [data.careReminder];
  if (!Array.isArray(data?.careReminders)) return [];
  return data.careReminders.filter(isCareReminderMarker);
};

export const reconcileDisplayedCareNotifications = async (events: LogEvent[]) => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications();

    for (const notification of notifications) {
      const reminders = getCareReminderMarkers(notification);
      if (reminders.length > 0 && reminders.every((reminder) => isCareReminderResolved(reminder, events))) {
        notification.close();
      }
    }
  } catch (error) {
    console.warn("Failed to reconcile care notifications", error);
  }
};
