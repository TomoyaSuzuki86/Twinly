import { doc, getDocFromServer, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";

export type TutorialOutcome = "completed" | "skipped";
// Keep preview completion separate from a future production rollout.
const scope = () => /--development[-.]|localhost|127\.0\.0\.1/.test(window.location.hostname) ? "development" : "production";
const documentId = () => `intro-${scope()}-v1`;
const localKey = (uid: string) => `twinly:${documentId()}:${uid}`;
const hasFinished = (value: unknown) => value === "completed" || value === "skipped";

export async function shouldShowTutorial(uid: string): Promise<boolean> {
  try { if (hasFinished(localStorage.getItem(localKey(uid)))) return false; } catch { /* Server remains authoritative. */ }
  if (!db) return false;
  try {
    const snapshot = await getDocFromServer(doc(db, "users", uid, "settings", documentId()));
    const outcome = snapshot.data()?.outcome;
    if (hasFinished(outcome)) {
      try { localStorage.setItem(localKey(uid), outcome); } catch { /* Optional cache. */ }
      return false;
    }
    return true;
  } catch {
    // Do not interrupt a returning user when their completion cannot be checked.
    // Manual replay remains available, including offline.
    return false;
  }
}

export function finishTutorial(uid: string, outcome: TutorialOutcome) {
  try { localStorage.setItem(localKey(uid), outcome); } catch { /* Optional cache. */ }
  if (db) void setDoc(doc(db, "users", uid, "settings", documentId()), {
    version: 1, outcome, updatedAt: serverTimestamp(),
  }, { merge: true }).catch(() => { /* Local completion still prevents repeat prompts on this device. */ });
}
