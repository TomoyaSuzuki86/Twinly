import { useState } from "react";
import type { User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { createWearPairingToken, hashWearPairingToken } from "./wear-link";

export function useWearPairing(user: User | null) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createPairingToken = async () => {
    if (!user || !db) return;
    setBusy(true);
    try {
      const nextToken = createWearPairingToken();
      const tokenHash = await hashWearPairingToken(nextToken);
      await Promise.all([
        setDoc(doc(db, "wearPairingTokens", tokenHash), {
          uid: user.uid,
          active: true,
          createdAt: serverTimestamp(),
        }),
        setDoc(
          doc(db, "users", user.uid, "settings", "wear"),
          { tokenHash, updatedAt: serverTimestamp() },
          { merge: true }
        ),
      ]);
      window.TwinlyAndroid?.saveWearToken?.(nextToken);
      setToken(nextToken);
    } catch (error) {
      console.error("Failed to create Wear OS pairing token", error);
      alert("Watch連携キーの作成に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return { token, busy, createPairingToken };
}
