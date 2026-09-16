import { useCallback, useState } from "react";
import type { BabyId } from "../types";

export type AppModal =
  | { kind: "milk"; babyId: BabyId }
  | { kind: "diaper"; babyId: BabyId }
  | { kind: "settings" }
  | { kind: "edit"; eventId: string }
  | { kind: "sleepTime"; babyId: BabyId; type: "sleepStart" | "wake" }
  | null;

type AppModalRequest =
  | { kind: "milk"; payload: { babyId: BabyId } }
  | { kind: "diaper"; payload: { babyId: BabyId } }
  | { kind: "edit"; payload: { eventId: string } }
  | { kind: "settings"; payload?: undefined };

export type OpenAppModalKind = AppModalRequest["kind"];
export type OpenAppModalPayload = AppModalRequest["payload"];

export const resolveAppModal = (
  kind: OpenAppModalKind,
  payload?: OpenAppModalPayload
): Exclude<AppModal, null> | null => {
  switch (kind) {
    case "milk":
    case "diaper":
      return payload && "babyId" in payload ? { kind, babyId: payload.babyId } : null;
    case "edit":
      return payload && "eventId" in payload ? { kind, eventId: payload.eventId } : null;
    case "settings":
      return { kind };
  }
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
