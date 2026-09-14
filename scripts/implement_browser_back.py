from pathlib import Path

HOOK = r'''import { useEffect, useRef } from "react";

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
'''

TEST = r'''import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserBackDismiss } from "./use-browser-back-dismiss";

function Harness({ open, onDismiss, any = false }: { open: boolean; onDismiss: () => void; any?: boolean }) {
  useBrowserBackDismiss(open, onDismiss, { dismissOnAnyPopState: any });
  return null;
}

beforeEach(() => window.history.replaceState({}, "", "/"));
afterEach(() => {
  window.history.replaceState({}, "", "/");
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useBrowserBackDismiss", () => {
  it("dismisses when Back removes its history guard", () => {
    const onDismiss = vi.fn();
    render(<Harness open onDismiss={onDismiss} />);
    expect(window.history.state.__twinlyOverlayStack).toHaveLength(1);
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: {} })));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    window.history.replaceState({}, "", "/");
  });

  it("does not dismiss while its guard remains", () => {
    const onDismiss = vi.fn();
    render(<Harness open onDismiss={onDismiss} />);
    const guardedState = window.history.state;
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: guardedState })));
    expect(onDismiss).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/");
  });

  it("supports tutorial semantics where any real Back ends it", () => {
    const onDismiss = vi.fn();
    render(<Harness open onDismiss={onDismiss} any />);
    const guardedState = window.history.state;
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: guardedState })));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    window.history.replaceState({}, "", "/");
  });
});
'''

Path('src/lib/use-browser-back-dismiss.ts').write_text(HOOK)
Path('src/lib/use-browser-back-dismiss.test.tsx').write_text(TEST)

dialog = Path('src/components/ui/dialog.tsx')
text = dialog.read_text()
old = 'import { cn } from "@/lib/utils"\n\nconst Dialog = DialogPrimitive.Root'
new = 'import { cn } from "@/lib/utils"\nimport { useBrowserBackDismiss } from "@/lib/use-browser-back-dismiss"\n\nconst Dialog = DialogPrimitive.Root'
if old not in text:
    raise SystemExit('dialog import anchor not found')
text = text.replace(old, new, 1)

old = '  const swipeStartRef = React.useRef<SwipePoint | null>(null)\n\n  React.useEffect(() => {'
new = '''  const swipeStartRef = React.useRef<SwipePoint | null>(null)\n  const browserBackCloseRef = React.useRef<HTMLButtonElement>(null)\n\n  useBrowserBackDismiss(true, () => {\n    browserBackCloseRef.current?.click()\n  })\n\n  React.useEffect(() => {'''
if old not in text:
    raise SystemExit('dialog content anchor not found')
text = text.replace(old, new, 1)

old = '        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">'
new = '        <DialogPrimitive.Close ref={browserBackCloseRef} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">'
if old not in text:
    raise SystemExit('dialog close anchor not found')
dialog.write_text(text.replace(old, new, 1))

tutorial = Path('src/components/IntroTutorial.tsx')
text = tutorial.read_text()
old = 'import { finishTutorial, shouldShowTutorial, type TutorialOutcome } from "@/lib/tutorial-progress";\nimport "./intro-tutorial.css";'
new = 'import { finishTutorial, shouldShowTutorial, type TutorialOutcome } from "@/lib/tutorial-progress";\nimport { useBrowserBackDismiss } from "@/lib/use-browser-back-dismiss";\nimport "./intro-tutorial.css";'
if old not in text:
    raise SystemExit('tutorial import anchor not found')
text = text.replace(old, new, 1)

old = '''  const finish = (outcome: TutorialOutcome, after?: () => void) => {\n    clearSleepLongPress();\n    clearVoiceLongPress();\n    clearSleepTransition();\n    setVoiceListening(false);\n    setExitConfirmOpen(false);\n    setOpen(false);\n    void finishTutorial(uid, outcome);\n    window.scrollTo({ top: 0, behavior: "instant" });\n    after?.();\n  };\n\n  const beginSleepLongPress = () => {'''
new = '''  const finish = (outcome: TutorialOutcome, after?: () => void) => {\n    clearSleepLongPress();\n    clearVoiceLongPress();\n    clearSleepTransition();\n    setVoiceListening(false);\n    setExitConfirmOpen(false);\n    setOpen(false);\n    void finishTutorial(uid, outcome);\n    window.scrollTo({ top: 0, behavior: "instant" });\n    after?.();\n  };\n\n  useBrowserBackDismiss(open, () => finish("skipped"), { dismissOnAnyPopState: true });\n\n  const beginSleepLongPress = () => {'''
if old not in text:
    raise SystemExit('tutorial finish anchor not found')
tutorial.write_text(text.replace(old, new, 1))
