import { act, cleanup, render } from "@testing-library/react";
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
