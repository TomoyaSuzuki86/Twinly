import fs from 'node:fs';

const indexPath = 'functions/index.js';
const source = fs.readFileSync(indexPath, 'utf8');

const slice = (start, end, label) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Unable to locate ${label}`);
  return source.slice(startIndex, endIndex).trimEnd();
};

const sliceToEnd = (start, label) => {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Unable to locate ${label}`);
  return source.slice(startIndex).trimEnd();
};

const familyHelpers = slice(
  'const requireAuthUid = (request) => {',
  'const getAppRefForUid = async (uid) => {',
  'family helpers'
);
const appRefHelper = slice(
  'const getAppRefForUid = async (uid) => {',
  'exports.completeFamilyOnboarding =',
  'app ref helper'
);
const familyFunctions = slice(
  'exports.completeFamilyOnboarding =',
  'const toAsciiDigits =',
  'family functions'
)
  .replace('exports.completeFamilyOnboarding =', 'const completeFamilyOnboarding =')
  .replace('exports.createFamilyInvite =', 'const createFamilyInvite =')
  .replace('exports.joinFamily =', 'const joinFamily =');

const wearCore = slice(
  'const toAsciiDigits =',
  'const clampMilkGaugeWindowHours =',
  'wear parsing and persistence'
);
const wearElapsed = slice(
  'const buildLatestMilkElapsedByBaby =',
  'const groupCandidatesForNotification =',
  'wear elapsed helpers'
);
const reminderCore = slice(
  'const clampMilkGaugeWindowHours =',
  'const buildLatestMilkElapsedByBaby =',
  'reminder candidate helpers'
);
const reminderDelivery = slice(
  'const groupCandidatesForNotification =',
  'exports.recordFromWear =',
  'reminder delivery'
).replace('exports.sendMilkReminderNotifications =', 'const sendMilkReminderNotifications =');
const wearEndpoints = sliceToEnd('exports.recordFromWear =', 'wear endpoints')
  .replace('exports.recordFromWear =', 'const recordFromWear =')
  .replace('exports.undoWearRecord =', 'const undoWearRecord =')
  .replace('exports.latestMilkElapsedFromWear =', 'const latestMilkElapsedFromWear =');

const runtimeContext = `const createRuntimeContext = ({ db, accessFor }) => {\n  const familyAccess = async (familyId) => {\n    const snap = await db.collection("families").doc(familyId).collection("services").doc("access").get();\n    // previewPlan is written only after verifying the active family owner.\n    return accessFor(snap.data(), true);\n  };\n\n${appRefHelper.replace(/^/gm, '  ')}\n\n  return { familyAccess, getAppRefForUid };\n};\n\nmodule.exports = createRuntimeContext;\n`;

const familyModule = `const crypto = require("crypto");\nconst { accessFor } = require("./ai-policy");\nconst { HttpsError, onCall } = require("firebase-functions/v2/https");\n\nconst inviteLifetimeMs = 24 * 60 * 60 * 1000;\nconst validRelationships = new Set(["father", "mother", "grandfather", "grandmother", "other"]);\nconst publicCallableOptions = { invoker: "public" };\n\nmodule.exports = ({ admin, db, familyAccess }) => {\n${familyHelpers.replace(/^/gm, '  ')}\n\n${familyFunctions.replace(/^/gm, '  ')}\n\n  return { completeFamilyOnboarding, createFamilyInvite, joinFamily };\n};\n`;

const wearModule = `const crypto = require("crypto");\nconst { readApp, writeApp, assertWritable } = require("./app-storage");\nconst { onRequest } = require("firebase-functions/v2/https");\n\nconst geminiApiKey = process.env.GEMINI_API_KEY;\nconst geminiModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";\nconst normalizeWearToken = (token) => String(token || "").replace(/[^a-z0-9]/gi, "").toUpperCase();\nconst hashWearToken = (token) => crypto.createHash("sha256").update(normalizeWearToken(token)).digest("hex");\nconst createEventId = () => \`${'${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}'}\`;\n\nmodule.exports = ({ admin, db, getAppRefForUid, logger }) => {\n${wearCore.replace(/^/gm, '  ')}\n\n${wearElapsed.replace(/^/gm, '  ')}\n\n${wearEndpoints.replace(/^/gm, '  ')}\n\n  return { recordFromWear, undoWearRecord, latestMilkElapsedFromWear };\n};\n`;

const reminderModule = `const { stockAlerts } = require("./stock-alerts");\nconst { buildCareNotificationPayload, buildSleepReminderCandidate } = require("./care-reminders");\nconst { readApp } = require("./app-storage");\nconst webpush = require("web-push");\nconst { defineSecret } = require("firebase-functions/params");\nconst { onSchedule } = require("firebase-functions/v2/scheduler");\n\nconst mergeWindowMinutes = 15;\nconst mergeWindowMs = mergeWindowMinutes * 60 * 1000;\nconst defaultMilkGaugeWindowHours = 3;\nconst diaperGaugeWindowMinutes = 120;\nconst webPushPrivateKey = defineSecret("TWINLY_WEB_PUSH_PRIVATE_KEY");\nconst publicKey = "BKEpEJv5umbr7E9b5dptGP0YgCV8EdVo13tDzYxUHrue90qhqIddPtzGjxv5eFuRnQgghz_G_9yOCZQV3QS8SQI";\nconst subject = "mailto:no-reply@twinly.local";\n\nmodule.exports = ({ admin, db, familyAccess, getAppRefForUid, logger }) => {\n${reminderCore.replace(/^/gm, '  ')}\n\n${reminderDelivery.replace(/^/gm, '  ')}\n\n  return { sendMilkReminderNotifications };\n};\n`;

const nextIndex = `const admin = require("firebase-admin");\nconst { accessFor } = require("./ai-policy");\nconst { logger, setGlobalOptions } = require("firebase-functions/v2");\n\nadmin.initializeApp();\nsetGlobalOptions({ region: "asia-northeast1", maxInstances: 1 });\n\nconst db = admin.firestore();\nconst { familyAccess, getAppRefForUid } = require("./runtime-context")({ db, accessFor });\n\nObject.assign(exports, require("./ai-service")(db));\nObject.assign(exports, require("./family-functions")({ admin, db, familyAccess }));\nObject.assign(exports, require("./reminder-functions")({ admin, db, familyAccess, getAppRefForUid, logger }));\nObject.assign(exports, require("./wear-functions")({ admin, db, getAppRefForUid, logger }));\n`;

fs.writeFileSync('functions/runtime-context.js', runtimeContext);
fs.writeFileSync('functions/family-functions.js', familyModule);
fs.writeFileSync('functions/wear-functions.js', wearModule);
fs.writeFileSync('functions/reminder-functions.js', reminderModule);
fs.writeFileSync(indexPath, nextIndex);
