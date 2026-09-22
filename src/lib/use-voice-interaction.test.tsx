import { act, cleanup, renderHook } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BabyId } from "@/types";
import { useVoiceInteraction } from "./use-voice-interaction";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("split-layout voice targeting", () => {
  it("starts recognition immediately and exactly once for only the requested baby", () => {
    const setSelectedBabyTab = vi.fn() as unknown as Dispatch<SetStateAction<BabyId>>;
    const startListening = vi.fn();
    const { result } = renderHook(() => useVoiceInteraction(setSelectedBabyTab));

    act(() => {
      result.current.voiceButtonRef.current = { startListening };
      result.current.startVoiceInputForBabyTab("B");
    });

    expect(startListening).toHaveBeenCalledTimes(1);
    expect(startListening).toHaveBeenCalledWith("B");
    expect(startListening).not.toHaveBeenCalledWith("A");
    expect(startListening).not.toHaveBeenCalledWith("both");
    expect(setSelectedBabyTab).toHaveBeenCalledTimes(1);
    expect(setSelectedBabyTab).toHaveBeenCalledWith("B");
  });

  it("claims the requested baby before a same-gesture targetless start can run", () => {
    const setSelectedBabyTab = vi.fn() as unknown as Dispatch<SetStateAction<BabyId>>;
    const acceptedTargets: string[] = [];
    let active = false;
    const startListening = vi.fn((target?: "A" | "B" | "both") => {
      if (active) return;
      active = true;
      acceptedTargets.push(target ?? "both");
    });
    const { result } = renderHook(() => useVoiceInteraction(setSelectedBabyTab));

    act(() => {
      result.current.voiceButtonRef.current = { startListening };
      result.current.startVoiceInputForBabyTab("B");
      result.current.startVoiceInput();
    });

    expect(startListening.mock.calls).toEqual([["B"], ["both"]]);
    expect(acceptedTargets).toEqual(["B"]);
  });
});
