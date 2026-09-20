import fs from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const projectId = "twinly-rules-ci";
const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: fs.readFileSync("firestore.rules", "utf8"),
  },
});

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "families/family-1"), { ownerUid: "owner" });
    await setDoc(doc(db, "families/family-1/members/owner"), {
      status: "active",
      role: "owner",
    });
    await setDoc(doc(db, "families/family-1/members/member"), {
      status: "active",
      role: "member",
    });
    await setDoc(doc(db, "families/family-1/services/access"), {
      features: { familySharing: true },
    });
    await setDoc(doc(db, "families/family-1/app/state"), {
      schemaVersion: 2,
      migrationState: "",
      app: { profiles: {}, ui: {} },
    });
  });

  const ownerDb = testEnv.authenticatedContext("owner").firestore();
  const memberDb = testEnv.authenticatedContext("member").firestore();
  const outsiderDb = testEnv.authenticatedContext("outsider").firestore();

  await assertSucceeds(getDoc(doc(ownerDb, "families/family-1/app/state")));
  await assertSucceeds(getDoc(doc(memberDb, "families/family-1/app/state")));
  await assertFails(getDoc(doc(outsiderDb, "families/family-1/app/state")));

  await assertSucceeds(
    setDoc(doc(ownerDb, "families/family-1/events/valid-event"), {
      id: "valid-event",
      babyId: "A",
      type: "milk",
      timestamp: 1,
      milkMl: 120,
    })
  );
  await assertFails(
    setDoc(doc(ownerDb, "families/family-1/events/invalid-event"), {
      id: "invalid-event",
      babyId: "C",
      type: "milk",
      timestamp: 1,
      milkMl: 120,
    })
  );
} finally {
  await testEnv.cleanup();
}
