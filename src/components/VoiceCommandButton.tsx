import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseVoiceCommand, VoiceCommand, VoiceCommandBabyNames, VoiceCommandParseResult } from "@/lib/voice-command";

type SpeechRecognitionResultItem = {
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
  defaultMilkMlByBaby?: Partial<Record<"A" | "B", number>>;
  now?: Date;
  onCommand: (command: VoiceCommand) => void;
  onMessage: (message: string) => void;
};

export type VoiceCommandButtonHandle = {
  startListening: () => void;
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
  { babyNames, defaultMilkMlByBaby, now = new Date(), onCommand, onMessage },
  ref
) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== "undefined" && Boolean(getSpeechRecognition());

  const stopListening = () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
  };

  const startListening = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      onMessage("このブラウザは音声入力に未対応です");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setListening(false);
      if (event.error !== "aborted") onMessage("音声入力に失敗しました");
    };
    recognition.onresult = (event) => {
      const transcript = event.results.item(0).item(0).transcript;
      const parsed = parseVoiceCommand(transcript, { babyNames, defaultMilkMlByBaby, now });
      if (!parsed.ok) {
        onMessage(parseErrorMessage(parsed.reason));
        return;
      }
      onCommand(parsed.command);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  useImperativeHandle(ref, () => ({ startListening }));

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
