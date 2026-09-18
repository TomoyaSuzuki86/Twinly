import type { User } from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";

export async function ensureNotificationSettingsDocument(user: User) {
  if (!db) return;
  const settingsRef = doc(db, "users", user.uid, "settings", "notifications");
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(settingsRef);
    if (snapshot.exists()) return;
    transaction.set(settingsRef, {
      milkReminder: { enabled: true, intervalMinutes: 150, mergeWindowMinutes: 15 },
      careReminder: { enabled: true, mergeWindowMinutes: 15 },
      updatedAt: serverTimestamp(),
    });
  });
}