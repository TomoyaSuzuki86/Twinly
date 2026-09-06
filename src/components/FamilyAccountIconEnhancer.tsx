import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/firebase";
import type { FamilyRelationship } from "@/types";

const accountIconLabels: Record<FamilyRelationship, string> = {
  father: "父",
  mother: "母",
  grandfather: "祖父",
  grandmother: "祖母",
  other: "他",
};

const isRelationship = (value: unknown): value is FamilyRelationship =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(accountIconLabels, value);

export function FamilyAccountIconEnhancer() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!auth || !db) return;

    let unsubscribeUser = () => {};
    let unsubscribeMember = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeUser();
      unsubscribeMember();
      setLabel("");
      if (!user) return;

      unsubscribeUser = onSnapshot(doc(db, "users", user.uid), (userSnapshot) => {
        unsubscribeMember();
        const familyId = userSnapshot.data()?.activeFamilyId;
        if (typeof familyId !== "string" || !familyId) {
          setLabel("");
          return;
        }

        unsubscribeMember = onSnapshot(doc(db, "families", familyId, "members", user.uid), (memberSnapshot) => {
          const relationship = memberSnapshot.data()?.relationship;
          setLabel(isRelationship(relationship) ? accountIconLabels[relationship] : "他");
        });
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUser();
      unsubscribeMember();
    };
  }, []);

  useEffect(() => {
    if (!label) return;

    const sync = () => {
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="アカウントと家族を開く"]');
      if (!button) return;
      if (button.textContent !== label) button.textContent = label;
      button.classList.remove("bg-violet-500/20", "text-violet-200", "hover:bg-violet-500/30");
      button.classList.add("bg-primary", "text-primary-foreground", "hover:bg-primary/90", "ring-1", "ring-primary/30");
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [label]);

  return null;
}
