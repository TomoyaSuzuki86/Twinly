const admin = require("firebase-admin");
const { accessFor } = require("./ai-policy");
const { logger, setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "asia-northeast1", maxInstances: 1 });

const db = admin.firestore();
const { familyAccess, getAppRefForUid } = require("./runtime-context")({ db, accessFor });

Object.assign(exports, require("./ai-service")(db));
Object.assign(exports, require("./family-functions")({ admin, db, familyAccess }));
Object.assign(exports, require("./reminder-functions")({ admin, db, familyAccess, getAppRefForUid, logger }));
Object.assign(exports, require("./wear-functions")({ admin, db, getAppRefForUid, logger }));


if (process.env.TWINLY_BILLING_ENABLED === "true") Object.assign(exports, require("./billing-service")(db));
