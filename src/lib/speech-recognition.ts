export type SpeechRecognitionResultItem = {
  isFinal?: boolean;
  transcript: string;
};

export type SpeechRecognitionAlternativeList = {
  readonly length: number;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
};

export type SpeechRecognitionResultList = {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeList;
  [index: number]: SpeechRecognitionAlternativeList;
};

export type SpeechRecognitionEvent = {
  resultIndex?: number;
  results: SpeechRecognitionResultList;
};

export type SpeechRecognitionErrorEvent = {
  error: string;
};

export type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous?: boolean;
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

export const getSpeechRecognition = () => {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
};
