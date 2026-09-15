import { useCallback, useState } from "react";
import type { BabyId } from "../types";

export type AppModal =
  | { kind: "milk"; babyId: BabyId }
  | { kind: "diaper"; babyId: BabyId }
  | { kind: "settings" }
  | { kind: "edit"; eventId: string }
  | { kind: "sleepTime"; babyId: BabyId; type: "sleepStart" | "wake" }
  | null;

export type OpenAppModalKind = "milk" | "diaper" | "edit" | "settings";
export type OpenAppModalPayload = { babyId: BabyId } | { eventId: string } | undefined;

export const resolveAppModal = (
  kind: OpenAppModalKind,
  payload?: OpenAppModalPayload
): Exclude<AppModal, null> | null => {
  if ((kind === "milk" || kind === "diaper") && payload && "babyId" in payload) {
    return { kind, babyId: payload.babyId };
  }
  if (kind === "edit" && payload && "eventId" in payload) {
    return { kind, eventId: payload.eventId };
  }
  if (kind === "settings") return { kind };
  return null;
};

export const useAppModalController = () => {
  const [modal, setModal] = useState<AppModal>(null);

  const openModal = useCallback((kind: OpenAppModalKind, payload?: OpenAppModalPayload) => {
    const next = resolveAppModal(kind, payload);
    if (next) setModal(next);
  }, []);

  const openSleepTime = useCallback(
    ({ babyId, type }: { babyId: BabyId; type: "sleepStart" | "wake" }) => {
      setModal({ kind: "sleepTime", babyId, type });
    },
    []
  );

  const closeModal = useCallback(() => setModal(null), []);

  return { modal, openModal, openSleepTime, closeModal };
};
