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

export function WakeWordButton({ disabled = false, onWakeWord, onMessage }: WakeWordButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const handoffTimerRef = useRef<number | null>(null);
  const enabledRef = useRef(false);
  const disabledRef = useRef(disabled);
  const handingOffRef = useRef(false);
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
      const transcripts = collectAlternatives(event.results, event.resultIndex);
      if (!findTwinlyWakeWord(transcripts)) return;

      handingOffRef.current = true;
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
    onMessage("「OK Twinly」と話してください");
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
      aria-label={enabled ? "stop OK Twinly hands-free input" : "start OK Twinly hands-free input"}
      aria-pressed={enabled}
      title={
        supported
          ? enabled
            ? listening
              ? "OK Twinlyを待っています"
              : "ハンズフリー入力を再開しています"
            : "OK Twinlyでハンズフリー入力"
          : "ハンズフリー入力はこのブラウザで使えません"
      }
    >
      <Radio className={`h-5 w-5 ${enabled && listening ? "animate-pulse" : ""}`} />
    </Button>
  );
}
