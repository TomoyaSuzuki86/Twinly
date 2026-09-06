import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/firebase";

const initialFromNickname = (nickname: unknown) =>
  typeof nickname === "string" ? nickname.trim().slice(0, 1) : "";

export function FamilyAccountIconEnhancer() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const currentAuth = auth;
    const currentDb = db;
    if (!currentAuth || !currentDb) return;

    let unsubscribeUser = () => {};
    let unsubscribeMember = () => {};

    const unsubscribeAuth = onAuthStateChanged(currentAuth, (user) => {
      unsubscribeUser();
      unsubscribeMember();
      setLabel("");
      if (!user) return;

      unsubscribeUser = onSnapshot(doc(currentDb, "users", user.uid), (userSnapshot) => {
        unsubscribeMember();
        const familyId = userSnapshot.data()?.activeFamilyId;
        if (typeof familyId !== "string" || !familyId) {
          setLabel("");
          return;
        }

        unsubscribeMember = onSnapshot(doc(currentDb, "families", familyId, "members", user.uid), (memberSnapshot) => {
          setLabel(initialFromNickname(memberSnapshot.data()?.nickname) || "?");
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
      button.classList.remove(
        "bg-violet-500/20",
        "text-violet-200",
        "hover:bg-violet-500/30",
        "bg-primary",
        "text-primary-foreground",
        "hover:bg-primary/90",
        "ring-1",
        "ring-primary/30"
      );
      button.classList.add("twinly-account-avatar");
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [label]);

  return null;
}
