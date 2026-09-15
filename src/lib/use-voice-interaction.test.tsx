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
  it("starts recognition exactly once for only the requested baby", () => {
    vi.useFakeTimers();
    const setSelectedBabyTab = vi.fn() as unknown as Dispatch<SetStateAction<BabyId>>;
    const startListening = vi.fn();
    const { result } = renderHook(() => useVoiceInteraction(setSelectedBabyTab));

    act(() => {
      result.current.voiceButtonRef.current = { startListening };
      result.current.startVoiceInputForBabyTab("B");
    });

    expect(setSelectedBabyTab).toHaveBeenCalledTimes(1);
    expect(setSelectedBabyTab).toHaveBeenCalledWith("B");
    expect(startListening).not.toHaveBeenCalled();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(startListening).toHaveBeenCalledTimes(1);
    expect(startListening).toHaveBeenCalledWith("B");
    expect(startListening).not.toHaveBeenCalledWith("A");
    expect(startListening).not.toHaveBeenCalledWith("both");
  });
});
