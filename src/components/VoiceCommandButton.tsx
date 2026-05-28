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

type SpeechRecognitionResultItem = {
  isFinal?: boolean;
  transcript: string;
};

type SpeechRecognitionAlternativeList = {
  readonly length: number;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
};

type SpeechRecognitionResultList = {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeList;
  [index: number]: SpeechRecognitionAlternativeList;
};

type SpeechRecognitionEvent = {
  resultIndex?: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = {
  error: string;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type VoiceCommandButtonProps = {
  babyNames?: VoiceCommandBabyNames;
  defaultMilkMlByBaby?: Partial<Record<BabyId, number>>;
  onCommand: (command: VoiceCommand) => void;
  onMessage: (message: string) => void;
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
    .filter(Boolean)
    .join(" ");
  const suffix = Array.from({ length: Math.max(0, results.length - changedIndex - 1) }, (_, offset) =>
    results.item(changedIndex + offset + 1).item(0)?.transcript?.trim()
  )
    .filter(Boolean)
    .join(" ");

  const changedAlternatives = collectTranscripts(results.item(changedIndex));
  const transcripts = changedAlternatives
    .map((transcript) => [prefix, transcript, suffix].filter(Boolean).join(" ").trim())
    .filter(Boolean);

  if (transcripts.length) return transcripts;

  const fallbackTranscript = Array.from({ length: results.length }, (_, index) => results.item(index).item(0)?.transcript?.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return fallbackTranscript ? [fallbackTranscript] : [];
};

const getSpeechRecognition = () => {
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
};

type VoiceCommandParseErrorReason = Extract<VoiceCommandParseResult, { ok: false }>["reason"];

const parseErrorMessage = (reason: VoiceCommandParseErrorReason) => {
  if (reason === "missingBaby") return "A/Bが聞き取れませんでした";
  if (reason === "missingMilkAmount") return "ミルク量が聞き取れませんでした";
  return "ミルク/おむつが聞き取れませんでした";
};

export const VoiceCommandButton = forwardRef<VoiceCommandButtonHandle, VoiceCommandButtonProps>(function VoiceCommandButton(
  { babyNames, defaultMilkMlByBaby, onCommand, onMessage },
  ref
) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const latestTranscriptsRef = useRef<string[]>([]);
  const forcedBabyIdRef = useRef<BabyId | undefined>(undefined);
  const submittedRef = useRef(false);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== "undefined" && Boolean(getSpeechRecognition());

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const submitLatestTranscript = () => {
    if (submittedRef.current) return;
    const transcripts = latestTranscriptsRef.current.map((transcript) => transcript.trim()).filter(Boolean);
    if (!transcripts.length) return;

    submittedRef.current = true;
    clearSilenceTimer();
    recognitionRef.current?.stop();

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
  };

  const scheduleSilenceSubmit = () => {
    clearSilenceTimer();
    silenceTimerRef.current = window.setTimeout(submitLatestTranscript, 1000);
  };

  const stopListening = () => {
    clearSilenceTimer();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    latestTranscriptsRef.current = [];
    forcedBabyIdRef.current = undefined;
    submittedRef.current = false;
    setListening(false);
  };

  const startListening = (forcedBabyId?: BabyId) => {
    clearSilenceTimer();
    latestTranscriptsRef.current = [];
    forcedBabyIdRef.current = forcedBabyId;
    submittedRef.current = false;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      onMessage("このブラウザは音声入力に未対応です");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      submitLatestTranscript();
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = (event) => {
      clearSilenceTimer();
      recognitionRef.current = null;
      setListening(false);
      latestTranscriptsRef.current = [];
      forcedBabyIdRef.current = undefined;
      submittedRef.current = false;
      if (event.error !== "aborted") onMessage("音声入力に失敗しました");
    };
    recognition.onresult = (event) => {
      const transcripts = collectBestTranscripts(event.results, event.resultIndex);
      if (!transcripts.length) return;
      latestTranscriptsRef.current = transcripts;
      scheduleSilenceSubmit();
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  useImperativeHandle(ref, () => ({ startListening }));

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      recognitionRef.current?.abort();
    };
  }, []);

  return (
    <Button
      variant={listening ? "default" : "ghost"}
      size="icon"
      onClick={listening ? stopListening : startListening}
      aria-label={listening ? "stop voice input" : "start voice input"}
      title={supported ? "音声入力" : "音声入力はこのブラウザで使えません"}
    >
      {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
    </Button>
  );
});
