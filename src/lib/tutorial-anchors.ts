import { useCallback, useMemo, useRef, type RefCallback } from "react";
import type { BabyId } from "@/types";

export type TutorialAnchorKey =
  | "baby-tabs"
  | "header"
  | "settings"
  | `baby-tab:${BabyId}`
  | `primary:${BabyId}:milk`
  | `primary:${BabyId}:diaper`
  | `primary:${BabyId}:sleep`
  | `logs:${BabyId}`
  | `log-summary:${BabyId}`
  | `timeline:${BabyId}`;

export type TutorialAnchorRefFactory = (key: TutorialAnchorKey) => RefCallback<HTMLElement>;

export type TutorialAnchorRegistry = {
  ref: TutorialAnchorRefFactory;
  get: (key: TutorialAnchorKey) => HTMLElement | null;
};

export const EMPTY_TUTORIAL_ANCHORS: TutorialAnchorRegistry = {
  ref: () => () => undefined,
  get: () => null,
};

export const resolveTutorialTargetKeys = (step: number, activeBabyId: BabyId): TutorialAnchorKey[] => {
  switch (step) {
    case 0:
      return ["baby-tabs"];
    case 1:
      return [
        `primary:${activeBabyId}:milk`,
        `primary:${activeBabyId}:diaper`,
        `primary:${activeBabyId}:sleep`,
      ];
    case 4:
      return ["baby-tab:A"];
    case 5:
    case 6:
      return ["header"];
    case 7:
      return [`logs:${activeBabyId}`];
    case 8:
      return [`log-summary:${activeBabyId}`];
    case 9:
      return [`timeline:${activeBabyId}`];
    case 11:
      return ["settings"];
    default:
      return [];
  }
};

export function useTutorialAnchors(): TutorialAnchorRegistry {
  const nodesRef = useRef(new Map<TutorialAnchorKey, HTMLElement>());
  const callbacksRef = useRef(new Map<TutorialAnchorKey, RefCallback<HTMLElement>>());

  const ref = useCallback<TutorialAnchorRefFactory>((key) => {
    const existing = callbacksRef.current.get(key);
    if (existing) return existing;

    const callback: RefCallback<HTMLElement> = (node) => {
      if (node) nodesRef.current.set(key, node);
      else nodesRef.current.delete(key);
    };
    callbacksRef.current.set(key, callback);
    return callback;
  }, []);

  const get = useCallback((key: TutorialAnchorKey) => nodesRef.current.get(key) ?? null, []);
  return useMemo(() => ({ ref, get }), [get, ref]);
}
