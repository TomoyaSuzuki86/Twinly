import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VoiceCommandButton,
  type VoiceCommandButtonHandle,
} from "./VoiceCommandButton";

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];

  lang = "";
  interimResults = false;
  maxAlternatives = 1;
  continuous = false;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn();
  abort = vi.fn();
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: { resultIndex?: number; results: ReturnType<typeof speechResults> }) => void) | null = null;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
}

const speechResults = (transcript: string) => {
  const alternative = { transcript };
  const alternatives = {
    length: 1,
    item: () => alternative,
    0: alternative,
  };
  return {
    length: 1,
    item: () => alternatives,
    0: alternatives,
  };
};

beforeEach(() => {
  MockSpeechRecognition.instances = [];
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    writable: true,
    value: MockSpeechRecognition,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
});

describe("VoiceCommandButton session target isolation", () => {
  it("keeps the B target when a duplicate targetless start arrives during the same voice session", () => {
    vi.useFakeTimers();
    const ref = createRef<VoiceCommandButtonHandle>();
    const onCommand = vi.fn();

    render(
      <VoiceCommandButton
        ref={ref}
        onCommand={onCommand}
        onMessage={vi.fn()}
      />
    );

    act(() => {
      ref.current?.startListening("B");
    });

    expect(MockSpeechRecognition.instances).toHaveLength(1);
    const originalSession = MockSpeechRecognition.instances[0];

    // Reproduces the dangerous Chromebook path: a second start without an explicit
    // baby target would normally restart recognition with the default target "both".
    act(() => {
      ref.current?.startListening();
    });

    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(originalSession.abort).not.toHaveBeenCalled();

    act(() => {
      originalSession.onresult?.({ resultIndex: 0, results: speechResults("ミルク 120") });
      vi.advanceTimersByTime(1400);
    });

    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        babyId: "B",
        type: "milk",
        milkMl: 120,
      })
    );
  });
});
