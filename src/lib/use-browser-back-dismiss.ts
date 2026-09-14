import { useEffect, useRef } from "react";

// Keep browser/PWA Back inside Twinly while an overlay is open.
const OVERLAY_STACK_KEY = "__twinlyOverlayStack";
const suppressedPopStates = new WeakSet<Event>();

let overlaySequence = 0;
let suppressionListenerInstalled = false;
let suppressedBackRequests = 0;
let suppressionResetTimer: number | null = null;

const readOverlayStack = (state: unknown): string[] => {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const value = (state as Record<string, unknown>)[OVERLAY_STACK_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const withOverlayStack = (state: unknown, stack: string[]) => {
  const base = state && typeof state === "object" && !Array.isArray(state)
    ? state as Record<string, unknown>
    : {};
  return { ...base, [OVERLAY_STACK_KEY]: stack };
};

const ensureSuppressionListener = () => {
  if (suppressionListenerInstalled || typeof window === "undefined") return;
  suppressionListenerInstalled = true;
  window.addEventListener("popstate", (event) => {
    if (suppressedBackRequests <= 0) return;
    suppressedBackRequests -= 1;
    suppressedPopStates.add(event);
    if (suppressedBackRequests === 0 && suppressionResetTimer !== null) {
      window.clearTimeout(suppressionResetTimer);
      suppressionResetTimer = null;
    }
  }, true);
};

const goBackWithoutDismiss = () => {
  ensureSuppressionListener();
  suppressedBackRequests += 1;
  if (suppressionResetTimer !== null) window.clearTimeout(suppressionResetTimer);
  suppressionResetTimer = window.setTimeout(() => {
    suppressedBackRequests = 0;
    suppressionResetTimer = null;
  }, 1500);
  window.history.back();
};

type BrowserBackDismissOptions = {
  dismissOnAnyPopState?: boolean;
};

export function useBrowserBackDismiss(
  open: boolean,
  onDismiss: () => void,
  { dismissOnAnyPopState = false }: BrowserBackDismissOptions = {}
) {
  const overlayIdRef = useRef<string | null>(null);
  const onDismissRef = useRef(onDismiss);
  const cleanupTimerRef = useRef<number | null>(null);

  if (overlayIdRef.current === null) {
    overlayIdRef.current = `twinly-overlay-${++overlaySequence}`;
  }

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;

    ensureSuppressionListener();
    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    const overlayId = overlayIdRef.current!;
    const currentStack = readOverlayStack(window.history.state);
    if (!currentStack.includes(overlayId)) {
      window.history.pushState(
        withOverlayStack(window.history.state, [...currentStack, overlayId]),
        "",
        window.location.href
      );
    }

    const handlePopState = (event: PopStateEvent) => {
      if (suppressedPopStates.has(event)) return;
      const nextStack = readOverlayStack(event.state);
      if (dismissOnAnyPopState || !nextStack.includes(overlayId)) {
        onDismissRef.current();
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      cleanupTimerRef.current = window.setTimeout(() => {
        cleanupTimerRef.current = null;
        const stack = readOverlayStack(window.history.state);
        if (!stack.includes(overlayId)) return;

        if (stack[stack.length - 1] === overlayId) {
          goBackWithoutDismiss();
          return;
        }

        window.history.replaceState(
          withOverlayStack(window.history.state, stack.filter((item) => item !== overlayId)),
          "",
          window.location.href
        );
      }, 0);
    };
  }, [open, dismissOnAnyPopState]);
}
