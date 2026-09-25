const functions = require("firebase-functions/v1");
const {
  projectFamilyReminders,
  projectionStateKey,
} = require("./reminder-projection");

const relevantTypes = new Set(["milk", "diaper", "sleepStart", "wake"]);

const revisionFor = (context) =>
  String(context.timestamp || new Date().toISOString());

const trigger = () =>
  functions
    .region("asia-northeast1")
    .runWith({ maxInstances: 1 })
    .firestore;

module.exports = ({ admin, db, logger }) => {
  const projectCareRemindersFromEvent = trigger()
    .document("families/{familyId}/events/{eventId}")
    .onWrite(async (change, context) => {
      const before = change.before.exists ? change.before.data() : undefined;
      const after = change.after.exists ? change.after.data() : undefined;
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
          familyId: context.params.familyId,
          babyIds: [...babyIds],
          revision: revisionFor(context),
        });
      } catch (error) {
        logger.error("Care reminder event projection failed", {
          familyId: context.params.familyId,
          eventId: context.params.eventId,
          message: error?.message,
        });
        throw error;
      }
    });

  const projectCareRemindersFromSettings = trigger()
    .document("families/{familyId}/app/state")
    .onWrite(async (change, context) => {
      const before = change.before.exists ? change.before.data() : undefined;
      const after = change.after.exists ? change.after.data() : undefined;
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
          familyId: context.params.familyId,
          babyIds: ["A", "B"],
          revision: revisionFor(context),
          stateData: after,
        });
      } catch (error) {
        logger.error("Care reminder settings projection failed", {
          familyId: context.params.familyId,
          message: error?.message,
        });
        throw error;
      }
    });

  return {
    projectCareRemindersFromEvent,
    projectCareRemindersFromSettings,
  };
};
