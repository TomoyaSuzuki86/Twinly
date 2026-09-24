const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const {
  projectFamilyReminders,
  projectionStateKey,
} = require("./reminder-projection");

const relevantTypes = new Set(["milk", "diaper", "sleepStart", "wake"]);
const options = { region: "asia-northeast1", maxInstances: 1 };

const revisionFor = (event) => String(event.time || new Date().toISOString());

module.exports = ({ admin, db, logger }) => {
  const projectCareRemindersFromEvent = onDocumentWritten(
    { ...options, document: "families/{familyId}/events/{eventId}" },
    async (event) => {
      const before = event.data?.before?.data();
      const after = event.data?.after?.data();
      const babyIds = new Set();

      for (const record of [before, after]) {
        if (record && relevantTypes.has(record.type) && ["A", "B"].includes(record.babyId)) {
          babyIds.add(record.babyId);
        }
      }
      if (!babyIds.size) return;

      try {
        await projectFamilyReminders({
          db,
          admin,
          familyId: event.params.familyId,
          babyIds: [...babyIds],
          revision: revisionFor(event),
        });
      } catch (error) {
        logger.error("Care reminder event projection failed", {
          familyId: event.params.familyId,
          eventId: event.params.eventId,
          message: error?.message,
        });
        throw error;
      }
    }
  );

  const projectCareRemindersFromSettings = onDocumentWritten(
    { ...options, document: "families/{familyId}/app/state" },
    async (event) => {
      const before = event.data?.before?.data();
      const after = event.data?.after?.data();
      if (!after?.app) return;

      const beforeVersion = before?.schemaVersion ?? 1;
      const afterVersion = after?.schemaVersion ?? 1;
      // V1 stores events inside this document, so any V1 state write can affect reminders.
      // V2 stores events separately; only reminder-relevant settings require reprojection here.
      if (
        before &&
        beforeVersion === 2 &&
        afterVersion === 2 &&
        projectionStateKey(before) === projectionStateKey(after)
      ) return;

      try {
        await projectFamilyReminders({
          db,
          admin,
          familyId: event.params.familyId,
          babyIds: ["A", "B"],
          revision: revisionFor(event),
          stateData: after,
        });
      } catch (error) {
        logger.error("Care reminder settings projection failed", {
          familyId: event.params.familyId,
          message: error?.message,
        });
        throw error;
      }
    }
  );

  return {
    projectCareRemindersFromEvent,
    projectCareRemindersFromSettings,
  };
};
