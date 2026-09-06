import { forwardRef, useImperativeHandle, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BabyId } from "@/types";
import {
  selectVoiceCommandFromAlternatives,
  VoiceCommand,
  VoiceCommandBabyNames,
  VoiceCommandParseResult,
} from "@/lib/voice-command";
import { mergeTranscriptSegments } from "@/lib/speech-transcript";
import {
  getSpeechRecognition,
  SpeechRecognitionAlternativeList,
  SpeechRecognitionInstance,
  SpeechRecognitionResultList,
} from "@/lib/speech-recognition";

type VoiceCommandButtonProps = {
  babyNames?: VoiceCommandBabyNames;
  defaultMilkMlByBaby?: Partial<Record<BabyId, number>>;
  onCommand: (command: VoiceCommand) => void;
  onMessage: (message: string) => void;
  onTranscript?: (text: string) => void;
};

export type VoiceCommandButtonHandle = {
  startListening: (forcedBabyId?: BabyId) => void;
};

const collectTranscripts = (result: SpeechRecognitionAlternativeList) => {
  const transcripts: string[] = [];
  for (let index = 0; index < result.length; index += 1) {
    const transcript = result.item(index)?.transcript?.trim();
    if (transcript) transcripts.push(transcript);
  }
  return transcripts;
};

const collectBestTranscripts = (results: SpeechRecognitionResultList, resultIndex = 0) => {
  if (!results.length) return [];

  const changedIndex = Math.min(Math.max(0, resultIndex), results.length - 1);
  const prefix = Array.from({ length: changedIndex }, (_, index) => results.item(index).item(0)?.transcript?.trim())
    .filter((transcript): transcript is string => Boolean(transcript));
  const suffix = Array.from({ length: Math.max(0, results.length - changedIndex - 1) }, (_, offset) =>
    results.item(changedIndex + offset + 1).item(0)?.transcript?.trim()
  ).filter((transcript): transcript is string => Boolean(transcript));

  const changedAlternatives = collectTranscripts(results.item(changedIndex));
  const transcripts = changedAlternatives
    .map((transcript) => mergeTranscriptSegments([...prefix, transcript, ...suffix]))
    .filter(Boolean);

  if (transcripts.length) return transcripts;

  const fallbackTranscript = mergeTranscriptSegments(
    Array.from({ length: results.length }, (_, index) => results.item(index).item(0)?.transcript?.trim()).filter(
      (transcript): transcript is string => Boolean(transcript)
    )
  );
  return fallbackTranscript ? [fallbackTranscript] : [];
};

type VoiceCommandParseErrorReason = Extract<VoiceCommandParseResult, { ok: false }>["reason"];

const parseErrorMessage = (reason: VoiceCommandParseErrorReason) => {
  if (reason === "missingBaby") return "A/Bが聞き取れませんでした";
  if (reason === "missingMilkAmount") return "ミルク量が聞き取れませんでした";
  return "ミルク/離乳食/おむつが聞き取れませんでした";
};

const SILENCE_SUBMIT_MS = 1400;
const RESTART_DELAY_MS = 180;
const MAX_LISTENING_MS = 20000;

export const VoiceCommandButton = forwardRef<VoiceCommandButtonHandle, VoiceCommandButtonProps>(function VoiceCommandButton(
  { babyNames, defaultMilkMlByBaby, onCommand, onMessage, onTranscript },
  ref
) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const maxListeningTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef(0);
  const latestTranscriptsRef = useRef<string[]>([]);
  const forcedBabyIdRef = useRef<BabyId | undefined>(undefined);
  const keepListeningRef = useRef(false);
  const submittedRef = useRef(false);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== "undefined" && Boolean(getSpeechRecognition());

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const clearMaxListeningTimer = () => {
    if (maxListeningTimerRef.current) {
      window.clearTimeout(maxListeningTimerRef.current);
      maxListeningTimerRef.current = null;
    }
  };

  const clearTimers = () => {
    clearSilenceTimer();
    clearRestartTimer();
    clearMaxListeningTimer();
  };

  const resetSession = (sessionId?: number) => {
    if (sessionId !== undefined && sessionId !== sessionIdRef.current) return;
    recognitionRef.current = null;
    latestTranscriptsRef.current = [];
    forcedBabyIdRef.current = undefined;
    keepListeningRef.current = false;
    submittedRef.current = false;
    setListening(false);
  };

  const submitLatestTranscript = (sessionId: number, stopRecognition = true) => {
    if (sessionId !== sessionIdRef.current) return;
    if (submittedRef.current) return;
    const transcripts = latestTranscriptsRef.current.map((transcript) => transcript.trim()).filter(Boolean);
    if (!transcripts.length) return;

    submittedRef.current = true;
    keepListeningRef.current = false;
    clearTimers();
    if (stopRecognition) {
      recognitionRef.current?.stop();
    }

    if (onTranscript) {
      onTranscript(transcripts[0]);
      forcedBabyIdRef.current = undefined;
      setListening(false);
      return;
    }
    const parsed = selectVoiceCommandFromAlternatives(transcripts, {
      babyNames,
      defaultMilkMlByBaby,
      forcedBabyId: forcedBabyIdRef.current,
      now: new Date(),
    });
    forcedBabyIdRef.current = undefined;
    if (!parsed.ok) {
      onMessage(parseErrorMessage(parsed.reason));
      return;
    }
    onCommand(parsed.command);
    setListening(false);
  };

  const scheduleSilenceSubmit = () => {
    clearSilenceTimer();
    const sessionId = sessionIdRef.current;
    silenceTimerRef.current = window.setTimeout(() => submitLatestTranscript(sessionId), SILENCE_SUBMIT_MS);
  };

  const stopListening = () => {
    sessionIdRef.current += 1;
    keepListeningRef.current = false;
    clearTimers();
    recognitionRef.current?.abort();
    resetSession();
  };

  const startListening = (forcedBabyId?: BabyId) => {
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    clearTimers();
    recognitionRef.current?.abort();
    latestTranscriptsRef.current = [];
    forcedBabyIdRef.current = forcedBabyId;
    keepListeningRef.current = true;
    submittedRef.current = false;
    setListening(true);

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      resetSession(sessionId);
      onMessage("このブラウザは音声入力に未対応です");
      return;
    }

    const beginRecognition = () => {
      if (sessionId !== sessionIdRef.current) return;
      if (!keepListeningRef.current || submittedRef.current) return;

      const recognition = new SpeechRecognition();
      recognition.lang = "ja-JP";
      recognition.interimResults = true;
      recognition.maxAlternatives = 5;
      recognition.continuous = true;

      recognition.onstart = () => setListening(true);
      recognition.onend = () => {
        if (sessionId !== sessionIdRef.current) return;
        recognitionRef.current = null;
        if (latestTranscriptsRef.current.length) {
          submitLatestTranscript(sessionId, false);
          return;
        }

        if (!keepListeningRef.current || submittedRef.current) {
          setListening(false);
          return;
        }

        clearRestartTimer();
        restartTimerRef.current = window.setTimeout(beginRecognition, RESTART_DELAY_MS);
      };
      recognition.onerror = (event) => {
        if (sessionId !== sessionIdRef.current) return;
        clearSilenceTimer();
        if (event.error === "aborted") {
          keepListeningRef.current = false;
          resetSession(sessionId);
          return;
        }

        if (event.error === "no-speech" || event.error === "audio-capture") {
          return;
        }

        keepListeningRef.current = false;
        resetSession(sessionId);
        onMessage(event.error === "not-allowed" ? "マイクの使用を許可してください" : "音声入力に失敗しました");
      };
      recognition.onresult = (event) => {
        if (sessionId !== sessionIdRef.current) return;
        const transcripts = collectBestTranscripts(event.results, event.resultIndex);
        if (!transcripts.length) return;
        latestTranscriptsRef.current = transcripts;
        scheduleSilenceSubmit();
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (error) {
        keepListeningRef.current = false;
        resetSession(sessionId);
        onMessage("音声入力を開始できませんでした");
      }
    };

    maxListeningTimerRef.current = window.setTimeout(() => {
      if (!latestTranscriptsRef.current.length) {
        onMessage("音声が聞き取れませんでした");
      }
      stopListening();
    }, MAX_LISTENING_MS);
    beginRecognition();
  };

  useImperativeHandle(ref, () => ({ startListening }));

  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      clearTimers();
      recognitionRef.current?.abort();
    };
  }, []);

  return (
    <Button
      variant={listening ? "default" : "ghost"}
      size="icon"
      onClick={() => (listening ? stopListening() : startListening())}
      aria-label={listening ? "stop voice input" : "start voice input"}
      title={supported ? "音声入力" : "音声入力はこのブラウザで使えません"}
    >
      {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
    </Button>
  );
});
