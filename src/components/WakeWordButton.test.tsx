import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WakeWordButton } from "./WakeWordButton";

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null;

  lang = "";
  interimResults = false;
  maxAlternatives = 1;
  continuous = false;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: { resultIndex: number; results: unknown }) => void) | null = null;

  start() {
    FakeSpeechRecognition.latest = this;
    this.onstart?.();
  }

  stop() {
    this.onend?.();
  }

  abort() {
    this.onend?.();
  }

  emit(transcript: string) {
    const alternative = { transcript };
    const alternatives = {
      length: 1,
      0: alternative,
      item: () => alternative,
    };
    const results = {
      length: 1,
      0: alternatives,
      item: () => alternatives,
    };
    this.onresult?.({ resultIndex: 0, results });
  }
}

describe("WakeWordButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSpeechRecognition.latest = null;
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: FakeSpeechRecognition,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: undefined,
    });
  });

  it("hands control to command input after hearing OK Twinly", async () => {
    const onWakeWord = vi.fn();
    const onMessage = vi.fn();
    render(<WakeWordButton onWakeWord={onWakeWord} onMessage={onMessage} />);

    fireEvent.click(screen.getByRole("button", { name: "start OK Twinly hands-free input" }));
    expect(onMessage).toHaveBeenCalledWith("「OK Twinly」と話してください");

    act(() => FakeSpeechRecognition.latest?.emit("オーケー ツインリー"));
    expect(onMessage).toHaveBeenCalledWith("はい、どうぞ");

    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(onWakeWord).toHaveBeenCalledTimes(1);
  });
});
