import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSpeechRecognition,
  SpeechRecognitionInstance,
  SpeechRecognitionResultList,
} from "@/lib/speech-recognition";
import { findTwinlyWakeWord } from "@/lib/wake-word";

type WakeWordButtonProps = {
  disabled?: boolean;
  onWakeWord: () => void;
  onMessage: (message: string) => void;
};

const RESTART_DELAY_MS = 250;
const COMMAND_HANDOFF_DELAY_MS = 300;
const WAKE_FRAGMENT_WINDOW_MS = 1_800;

type WakeFragment = {
  at: number;
  transcript: string;
};

const collectAlternatives = (results: SpeechRecognitionResultList, resultIndex = 0) => {
  const transcripts: string[] = [];
  const firstResultIndex = Math.min(Math.max(0, resultIndex), Math.max(0, results.length - 1));

  for (let resultIndex = firstResultIndex; resultIndex < results.length; resultIndex += 1) {
    const alternatives = results.item(resultIndex);
    for (let alternativeIndex = 0; alternativeIndex < alternatives.length; alternativeIndex += 1) {
      const transcript = alternatives.item(alternativeIndex)?.transcript?.trim();
      if (transcript) transcripts.push(transcript);
    }
  }

  return transcripts;
};

const collectFinalTranscripts = (results: SpeechRecognitionResultList, resultIndex = 0) => {
  const transcripts: string[] = [];
  const firstResultIndex = Math.min(Math.max(0, resultIndex), Math.max(0, results.length - 1));

  for (let index = firstResultIndex; index < results.length; index += 1) {
    const result = results.item(index);
    if (!result.isFinal) continue;
    const transcript = result.item(0)?.transcript?.trim();
    if (transcript) transcripts.push(transcript);
  }

  return transcripts;
};

const collectCombinedAlternatives = (results: SpeechRecognitionResultList) => {
  const transcripts: string[] = [];
  let maxAlternatives = 0;

  for (let index = 0; index < results.length; index += 1) {
    maxAlternatives = Math.max(maxAlternatives, results.item(index).length);
  }

  for (let alternativeIndex = 0; alternativeIndex < maxAlternatives; alternativeIndex += 1) {
    const fragments: string[] = [];
    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const result = results.item(resultIndex);
      const transcript = result.item(Math.min(alternativeIndex, result.length - 1))?.transcript?.trim();
      if (transcript) fragments.push(transcript);
    }
    if (fragments.length) transcripts.push(fragments.join(" "));
  }

  return transcripts;
};

export function WakeWordButton({ disabled = false, onWakeWord, onMessage }: WakeWordButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const handoffTimerRef = useRef<number | null>(null);
  const enabledRef = useRef(false);
  const disabledRef = useRef(disabled);
  const handingOffRef = useRef(false);
  const wakeFragmentsRef = useRef<WakeFragment[]>([]);
  const mountedRef = useRef(true);
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const supported = Boolean(getSpeechRecognition());

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const clearHandoffTimer = () => {
    if (handoffTimerRef.current) {
      window.clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
  };

  const stopRecognition = () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) recognition.abort();
    if (mountedRef.current) setListening(false);
  };

  function scheduleRestart() {
    clearRestartTimer();
    if (!enabledRef.current || disabledRef.current || handingOffRef.current) return;
    if (document.visibilityState !== "visible") return;
    restartTimerRef.current = window.setTimeout(beginListening, RESTART_DELAY_MS);
  }

  function beginListening() {
    clearRestartTimer();
    if (!enabledRef.current || disabledRef.current || handingOffRef.current) return;
    if (document.visibilityState !== "visible" || recognitionRef.current) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      enabledRef.current = false;
      setEnabled(false);
      setListening(false);
      onMessage("このブラウザはハンズフリー入力に未対応です");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    recognition.continuous = true;

    recognition.onstart = () => {
      if (mountedRef.current) setListening(true);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (mountedRef.current) setListening(false);
      scheduleRestart();
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (mountedRef.current) setListening(false);

      if (event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        enabledRef.current = false;
        setEnabled(false);
        onMessage("マイクの使用を許可してください");
        return;
      }

      if (event.error !== "no-speech") {
        onMessage("ハンズフリー待受を再開します");
      }
      scheduleRestart();
    };
    recognition.onresult = (event) => {
      const now = Date.now();
      const transcripts = collectAlternatives(event.results, event.resultIndex);
      const combinedTranscripts = collectCombinedAlternatives(event.results);
      const recentFragments = wakeFragmentsRef.current.filter(
        (fragment) => now - fragment.at <= WAKE_FRAGMENT_WINDOW_MS
      );
      wakeFragmentsRef.current = recentFragments;
      const recentTranscript = recentFragments.map((fragment) => fragment.transcript).join(" ");
      const candidates = [
        ...transcripts,
        ...combinedTranscripts,
        ...combinedTranscripts.map((transcript) => `${recentTranscript} ${transcript}`.trim()),
      ];

      if (!findTwinlyWakeWord(candidates)) {
        const finalTranscripts = collectFinalTranscripts(event.results, event.resultIndex);
        finalTranscripts.forEach((transcript) => wakeFragmentsRef.current.push({ at: now, transcript }));
        wakeFragmentsRef.current = wakeFragmentsRef.current.slice(-2);
        return;
      }

      handingOffRef.current = true;
      wakeFragmentsRef.current = [];
      clearRestartTimer();
      recognitionRef.current = null;
      recognition.abort();
      if (mountedRef.current) setListening(false);
      onMessage("はい、どうぞ");

      clearHandoffTimer();
      handoffTimerRef.current = window.setTimeout(() => {
        if (!enabledRef.current) return;
        onWakeWord();
      }, COMMAND_HANDOFF_DELAY_MS);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      scheduleRestart();
    }
  }

  const disableHandsFree = () => {
    enabledRef.current = false;
    handingOffRef.current = false;
    wakeFragmentsRef.current = [];
    setEnabled(false);
    clearRestartTimer();
    clearHandoffTimer();
    stopRecognition();
    onMessage("ハンズフリー入力を終了しました");
  };

  const enableHandsFree = () => {
    if (!supported) {
      onMessage("このブラウザはハンズフリー入力に未対応です");
      return;
    }
    enabledRef.current = true;
    handingOffRef.current = false;
    setEnabled(true);
    onMessage("「ヘイツイン」と話してください");
    // Start directly from the click so the browser can request microphone
    // permission within a user gesture.
    beginListening();
  };

  useEffect(() => {
    disabledRef.current = disabled;
    if (!enabledRef.current) return;

    if (disabled) {
      clearRestartTimer();
      stopRecognition();
      return;
    }

    handingOffRef.current = false;
    scheduleRestart();
  }, [disabled]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wakeFragmentsRef.current = [];
        clearRestartTimer();
        stopRecognition();
        return;
      }
      scheduleRestart();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      enabledRef.current = false;
      clearRestartTimer();
      clearHandoffTimer();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return (
    <Button
      variant={enabled ? "default" : "ghost"}
      size="icon"
      onClick={enabled ? disableHandsFree : enableHandsFree}
      aria-label={enabled ? "stop Twinly wake phrase input" : "start Twinly wake phrase input"}
      aria-pressed={enabled}
      title={
        supported
          ? enabled
            ? listening
              ? "「ヘイツイン」を待っています"
              : "ハンズフリー入力を再開しています"
            : "「ヘイツイン」でハンズフリー入力"
          : "ハンズフリー入力はこのブラウザで使えません"
      }
    >
      <Radio className={`h-5 w-5 ${enabled && listening ? "animate-pulse" : ""}`} />
    </Button>
  );
}
