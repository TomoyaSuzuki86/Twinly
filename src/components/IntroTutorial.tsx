import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Clock3, Droplets, Mic, Milk, Moon, Settings as SettingsIcon, Sun, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { SleepRecordModal } from "./SleepRecordModal";
import { VoiceCommandButton, type VoiceCommandButtonHandle } from "./VoiceCommandButton";
import { EventCard } from "./EventCard";
import { EditModal } from "./EditModal";
import type { LogEvent } from "@/types";
import type { VoiceCommand } from "@/lib/voice-command";
import { finishTutorial, shouldShowTutorial, type TutorialOutcome } from "@/lib/tutorial-progress";
import "./intro-tutorial.css";

type Props = {
  uid: string;
  ready: boolean;
  blocked: boolean;
  replay: number;
  names: [string, string];
};

type Rect = { top: number; left: number; width: number; height: number };
type SleepType = "sleepStart" | "wake";

const activePanel = () =>
  document.querySelector<HTMLElement>('.twinly-baby-tabs-content[data-state="active"]');

const targetResolvers: Array<() => HTMLElement | null> = [
  () => document.querySelector<HTMLElement>('[data-tutorial="babies"]'),
  () => activePanel()?.querySelector<HTMLElement>('[aria-label^="食事を記録"]') ?? null,
  () => null,
  () => null,
  () => document.querySelector<HTMLElement>('[data-tutorial="baby-A"]'),
  () => document.querySelector<HTMLElement>('[data-tutorial="header"]'),
  () => document.querySelector<HTMLElement>('[data-tutorial="header"]'),
  () => activePanel()?.querySelector<HTMLElement>('[data-tutorial="logs"]') ?? null,
  () => null,
  () => null,
  () => document.querySelector<HTMLElement>('[aria-label="settings"]'),
];

const TOTAL_STEPS = targetResolvers.length;
const scrollTargetIntoView = new Set([1, 7]);
const voiceSteps = new Set([4, 5]);

const premiumShots = [
  { src: "/tutorial/premium-theme.webp", label: "テーマ", alt: "Twinlyのテーマ画面" },
  { src: "/tutorial/premium-ai.webp", label: "AIアドバイス", alt: "TwinlyのAIアドバイス画面" },
  { src: "/tutorial/premium-sakura.webp", label: "さくら", alt: "Twinlyのさくらテーマ画面" },
  { src: "/tutorial/premium-sun.webp", label: "ひだまり", alt: "Twinlyのひだまりテーマ画面" },
] as const;

const formatClock = (timestamp: number) =>
  new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));

export function IntroTutorial({ uid, ready, blocked, replay, names }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [practiced, setPracticed] = useState(false);
  const [status, setStatus] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);

  const [tutorialSleeping, setTutorialSleeping] = useState(false);
  const [sleepTransition, setSleepTransition] = useState<SleepType | null>(null);
  const [sleepModalOpen, setSleepModalOpen] = useState(false);
  const [sleepModalType, setSleepModalType] = useState<SleepType>("sleepStart");
  const [fakeSleepEvent, setFakeSleepEvent] = useState<LogEvent | null>(null);
  const [fakeEditOpen, setFakeEditOpen] = useState(false);

  const [voiceListening, setVoiceListening] = useState(false);
  const [voicePreviewEvents, setVoicePreviewEvents] = useState<LogEvent[]>([]);
  const [recognizedVoiceText, setRecognizedVoiceText] = useState("");

  const checked = useRef(false);
  const replaySeen = useRef(0);
  const sleepLongPressTimerRef = useRef<number | null>(null);
  const sleepLongPressTriggeredRef = useRef(false);
  const sleepTransitionTimerRef = useRef<number | null>(null);
  const voiceLongPressTimerRef = useRef<number | null>(null);
  const voiceLongPressTriggeredRef = useRef(false);
  const voiceLastTapRef = useRef(0);
  const tutorialVoiceRef = useRef<VoiceCommandButtonHandle | null>(null);

  const clearSleepLongPress = () => {
    if (sleepLongPressTimerRef.current !== null) window.clearTimeout(sleepLongPressTimerRef.current);
    sleepLongPressTimerRef.current = null;
  };

  const clearVoiceLongPress = () => {
    if (voiceLongPressTimerRef.current !== null) window.clearTimeout(voiceLongPressTimerRef.current);
    voiceLongPressTimerRef.current = null;
  };

  const clearSleepTransition = () => {
    if (sleepTransitionTimerRef.current !== null) window.clearTimeout(sleepTransitionTimerRef.current);
    sleepTransitionTimerRef.current = null;
  };

  const resetSession = () => {
    clearSleepLongPress();
    clearVoiceLongPress();
    clearSleepTransition();
    setStep(0);
    setPracticed(false);
    setStatus("");
    setRect(null);
    setTutorialSleeping(false);
    setSleepTransition(null);
    setSleepModalOpen(false);
    setSleepModalType("sleepStart");
    setFakeSleepEvent(null);
    setFakeEditOpen(false);
    setVoiceListening(false);
    setVoicePreviewEvents([]);
    setRecognizedVoiceText("");
    sleepLongPressTriggeredRef.current = false;
    voiceLongPressTriggeredRef.current = false;
    voiceLastTapRef.current = 0;
  };

  useEffect(() => {
    if (!ready || blocked || checked.current) return;
    let cancelled = false;
    void shouldShowTutorial(uid).then((show) => {
      if (cancelled) return;
      checked.current = true;
      if (show && replaySeen.current === 0) {
        resetSession();
        setOpen(true);
      }
    });
    return () => { cancelled = true; };
  }, [uid, ready, blocked]);

  useEffect(() => {
    if (!replay || replay === replaySeen.current || blocked) return;
    replaySeen.current = replay;
    resetSession();
    setOpen(true);
  }, [replay, blocked]);

  useEffect(() => () => {
    clearSleepLongPress();
    clearVoiceLongPress();
    clearSleepTransition();
  }, []);

  useEffect(() => {
    if (!open || sleepModalOpen || fakeEditOpen) return;

    const measure = () => {
      const target = targetResolvers[step]?.();
      if (scrollTargetIntoView.has(step)) {
        target?.scrollIntoView?.({ block: "center", behavior: "instant" });
      } else if (step !== 2 && step !== 3) {
        window.scrollTo({ top: 0, behavior: "instant" });
      }

      const box = target?.getBoundingClientRect();
      if (!box || !box.width || !box.height) {
        setRect(null);
        return;
      }

      const left = Math.max(8, box.left - 4);
      const top = Math.max(8, box.top - 4);
      setRect({
        top,
        left,
        width: Math.min(box.width + 8, window.innerWidth - left - 8),
        height: box.height + 8,
      });
    };

    measure();
    const interval = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, sleepModalOpen, fakeEditOpen]);

  useEffect(() => {
    if (!open) return;
    setPracticed(false);
    setStatus("");
    setVoiceListening(false);
    setVoicePreviewEvents([]);
    setRecognizedVoiceText("");
    voiceLastTapRef.current = 0;
    clearVoiceLongPress();

    if (step === 2) {
      setStatus("このボタンはチュートリアル専用です。長押しして時刻を指定してみてください。");
    }
    if (step === 3 && !fakeSleepEvent) {
      setStatus("前の手順で作った練習記録がありません。戻って睡眠の長押しを試してください。");
    }
    if (step === 4) {
      setStatus("「ミルク180」と話してみてください。実際に認識しますが、育児ログには保存しません。");
    }
    if (step === 5) {
      setStatus("「10分前 おしっこ」と話してみてください。相対時刻と2人同時入力をまとめて練習します。");
    }
  }, [step, open]);

  const finish = (outcome: TutorialOutcome, after?: () => void) => {
    clearSleepLongPress();
    clearVoiceLongPress();
    clearSleepTransition();
    setVoiceListening(false);
    setOpen(false);
    void finishTutorial(uid, outcome);
    window.scrollTo({ top: 0, behavior: "instant" });
    after?.();
  };

  const beginSleepLongPress = () => {
    clearSleepLongPress();
    sleepLongPressTriggeredRef.current = false;
    sleepLongPressTimerRef.current = window.setTimeout(() => {
      sleepLongPressTriggeredRef.current = true;
      setSleepModalType(tutorialSleeping ? "wake" : "sleepStart");
      setSleepModalOpen(true);
    }, 550);
  };

  const simulateShortSleepPress = () => {
    if (sleepLongPressTriggeredRef.current) {
      sleepLongPressTriggeredRef.current = false;
      return;
    }

    const next: SleepType = tutorialSleeping ? "wake" : "sleepStart";
    setTutorialSleeping(next === "sleepStart");
    setSleepTransition(next);
    setStatus("短押しの動きも練習表示だけで再現しました。実際の記録は作られていません。長押しで時刻指定を試してください。");
    clearSleepTransition();
    sleepTransitionTimerRef.current = window.setTimeout(() => {
      setSleepTransition(null);
      sleepTransitionTimerRef.current = null;
    }, 2000);
  };

  const saveTutorialSleepTime = (timestamp: number) => {
    const type = sleepModalType;
    setTutorialSleeping(type === "sleepStart");
    setFakeSleepEvent({
      id: "tutorial-sleep-event",
      babyId: "A",
      type,
      timestamp,
      note: "チュートリアルの練習記録（実際には保存されません）",
    });
    setPracticed(true);
    setStatus(`${type === "sleepStart" ? "入眠" : "起床"}時刻を設定できました。これは練習用なので実際のログには保存されません。`);
  };

  const updateFakeSleepEvent = (_eventId: string, payload: Partial<LogEvent>) => {
    setFakeSleepEvent((current) => current ? { ...current, ...payload } : current);
    setStatus("練習記録を編集しました。最後に「削除」→「削除する」も試してください。");
  };

  const deleteFakeSleepEvent = () => {
    setFakeSleepEvent(null);
    setPracticed(true);
    setStatus("削除できました。チュートリアル内だけの練習なので、実際のログは一切変更されていません。");
  };

  const voiceTranscript = (command: VoiceCommand) =>
    command.note.startsWith("voice: ") ? command.note.slice("voice: ".length) : command.note;

  const handleTutorialVoiceCommand = (command: VoiceCommand) => {
    setVoiceListening(false);
    const transcript = voiceTranscript(command);
    setRecognizedVoiceText(transcript);

    if (step === 4) {
      const milkMl = command.type === "milk"
        ? command.milkMlByBaby?.A ?? command.milkMl
        : undefined;

      if (command.type !== "milk" || command.babyId !== "A" || milkMl !== 180) {
        setPracticed(false);
        setVoicePreviewEvents([]);
        setStatus(`「${transcript}」と認識しました。ここでは「ミルク180」と話して、${names[0]}だけに入る練習をしてみましょう。`);
        return;
      }

      setVoicePreviewEvents([{
        id: "tutorial-voice-A",
        babyId: "A",
        type: "milk",
        timestamp: command.timestamp,
        milkMl: 180,
        note: "チュートリアルの練習結果",
      }]);
      setPracticed(true);
      setStatus(`「${transcript}」を認識しました。${names[0]}だけに180mlが追加される動きを確認できます。実際には保存されません。`);
      return;
    }

    const minutesAgo = Math.round((Date.now() - command.timestamp) / 60000);
    const isExpectedTwinPractice =
      command.type === "diaper" &&
      command.diaperKind === "pee" &&
      command.babyId === "both" &&
      minutesAgo >= 8 &&
      minutesAgo <= 12;

    if (!isExpectedTwinPractice) {
      setPracticed(false);
      setVoicePreviewEvents([]);
      setStatus(`「${transcript}」と認識しました。ここでは「10分前 おしっこ」と話して、時刻指定と2人同時入力を試してみましょう。`);
      return;
    }

    const previewBase = {
      type: "diaper" as const,
      timestamp: command.timestamp,
      diaperKind: "pee" as const,
      note: "チュートリアルの練習結果",
    };
    setVoicePreviewEvents([
      { id: "tutorial-voice-A", babyId: "A", ...previewBase },
      { id: "tutorial-voice-B", babyId: "B", ...previewBase },
    ]);
    setPracticed(true);
    setStatus(`「${transcript}」を認識しました。10分前のおしっこが、${names[0]}と${names[1]}の2人へ同時に展開されます。実際には保存されません。`);
  };

  const handleTutorialVoiceMessage = (message: string) => {
    setVoiceListening(false);
    setVoicePreviewEvents([]);
    setStatus(`${message}。実際の記録は作成されていません。`);
  };

  const startTutorialVoice = () => {
    if (!voiceSteps.has(step) || voiceListening) return;
    const voice = tutorialVoiceRef.current;
    if (!voice) {
      setStatus("音声入力を開始できませんでした。");
      return;
    }

    setVoiceListening(true);
    setVoicePreviewEvents([]);
    setRecognizedVoiceText("");
    setStatus(
      step === 4
        ? "聞き取り中です。「ミルク180」と話してください。"
        : "聞き取り中です。「10分前 おしっこ」と話してください。"
    );
    voice.startListening(step === 4 ? "A" : undefined);
  };

  const beginVoiceLongPress = () => {
    if (!voiceSteps.has(step)) return;
    clearVoiceLongPress();
    voiceLongPressTriggeredRef.current = false;
    voiceLongPressTimerRef.current = window.setTimeout(() => {
      voiceLongPressTriggeredRef.current = true;
      startTutorialVoice();
    }, 550);
  };

  const endVoicePress = () => {
    clearVoiceLongPress();
    if (!voiceSteps.has(step)) return;
    if (voiceLongPressTriggeredRef.current) {
      voiceLongPressTriggeredRef.current = false;
      voiceLastTapRef.current = 0;
      return;
    }

    const now = Date.now();
    if (voiceLastTapRef.current && now - voiceLastTapRef.current < 350) {
      voiceLastTapRef.current = 0;
      startTutorialVoice();
    } else {
      voiceLastTapRef.current = now;
    }
  };

  const titles = [
    "まずは、記録する子を選ぶ",
    "基本の記録は、ボタンから",
    "睡眠は、長押しで時刻を指定",
    "練習ログを、削除してみる",
    "この子だけに、声で入力",
    "ヘッダーから、2人へまとめて入力",
    "声では、いろいろな記録ができます",
    "記録は、あとから直せます",
    "タイムラインで、1週間を見渡す",
    "もっと便利に使いたいときは",
    "最後に、設定を確認",
  ];

  const descriptions = [
    "名前のタブをタップ、または画面を左右にスワイプして切り替えます。横長画面で2人が左右に並ぶときは、切り替えずそれぞれの側で記録できます。",
    "食事・おむつはボタンを押して内容を選び、保存します。睡眠は1回押すと現在時刻、長押しすると時刻を指定して記録できます。ゲージや前回時刻は、次の記録タイミングの目安です。",
    "下の睡眠ボタンは本番と同じ見た目・操作の練習用です。約0.5秒長押しすると時刻設定が開きます。「記録する」まで進めてみてください。ここでの操作は実際の育児ログには保存されません。",
    "さっき作った練習用の睡眠ログを開き、「削除」→「削除する」と進んでみてください。本番と同じ編集画面ですが、この練習ログはチュートリアル内にしか存在しません。",
    `${names[0]}の名前を長押し、またはダブルタップすると、実際にマイクが起動します。「ミルク180」と話してみてください。${names[0]}だけに入る結果を画面上で確認しますが、実際のログには保存しません。`,
    "今度は画面上部のTwinlyを長押し、またはダブルタップします。「10分前 おしっこ」と話してみてください。名前を言わなくても、同じ内容が2人へ同時に入ることと、相対時刻も一緒に指定できることを練習します。",
    "音声入力はミルクだけではありません。おむつ・離乳食・入眠・起床にも対応し、「30分前」「8時30分」のように時刻まで一緒に話せます。",
    "本番では保存直後なら「取り消す」で戻せます。あとからはログを開いて編集・削除できます。",
    "タイムラインでは、1週間のミルク・離乳食・おむつ・睡眠を24時間軸でまとめて確認できます。生活リズムをざっと振り返りたいときに便利です。",
    "Twinlyには、画面テーマの追加やAIアドバイスなどの有料機能もあります。必要になったときに試せる程度に覚えておけば大丈夫です。",
    "設定では、2人の表示名・音声入力名・生年月日・アイコン・ミルクや睡眠の目安などを自分たちに合わせられます。最後にプロフィール設定を一度確認しておきましょう。",
  ];

  const voiceExamples = [
    "ミルク180",
    "おしっこ",
    "離乳食",
    "寝た / 起きた",
    "10分前におしっこ",
    "30分前にミルク180",
    "8時30分におしっこ",
  ];

  const requiresPractice = step === 2 || step === 3 || step === 4 || step === 5;
  const interactiveSpotlight = step === 4 || step === 5 || step === 10;
  const isVoiceStep = voiceSteps.has(step);

  const spotlightLabel =
    step === 4 ? `${names[0]}の音声入力を練習` :
    step === 5 ? "2人同時の音声入力を練習" :
    step === 10 ? "設定を開く" :
    "チュートリアル対象";

  const skipPractice = () => {
    setVoiceListening(false);
    setPracticed(true);
    setVoicePreviewEvents([]);
    setStatus("この手順はスキップしました。音声入力はあとからいつでも試せます。");
  };

  const completeAndOpenSettings = () => {
    const settingsButton = targetResolvers[10]?.();
    finish("completed", () => {
      window.setTimeout(() => settingsButton?.click(), 0);
    });
  };

  const tutorialModalOpen = sleepModalOpen || fakeEditOpen;

  return <>
    <Dialog.Root open={open} onOpenChange={(value) => { if (!value) finish("skipped"); }}>
      {!tutorialModalOpen && <Dialog.Portal>
        <Dialog.Overlay className="twinly-tutorial-backdrop" />
        <Dialog.Content
          className="twinly-tutorial"
          onPointerDownOutside={(event) => event.preventDefault()}
          aria-describedby="tutorial-description"
        >
          {rect && <button
            type="button"
            className="twinly-tutorial-spotlight"
            style={rect}
            tabIndex={interactiveSpotlight ? 0 : -1}
            disabled={!interactiveSpotlight}
            aria-label={spotlightLabel}
            onPointerDown={() => {
              if (isVoiceStep) beginVoiceLongPress();
            }}
            onPointerUp={() => {
              if (isVoiceStep) endVoicePress();
            }}
            onPointerLeave={() => {
              clearVoiceLongPress();
              voiceLongPressTriggeredRef.current = false;
              voiceLastTapRef.current = 0;
            }}
            onPointerCancel={() => {
              clearVoiceLongPress();
              voiceLongPressTriggeredRef.current = false;
              voiceLastTapRef.current = 0;
            }}
            onClick={() => {
              if (step === 10) completeAndOpenSettings();
            }}
            onContextMenu={(event) => event.preventDefault()}
          />}

          <section className="twinly-tutorial-card">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                使い方 <span className="ml-2">{step + 1} / {TOTAL_STEPS}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => finish("skipped")}>スキップ</Button>
            </div>

            <div key={step} className="twinly-tutorial-copy">
              <Dialog.Title className="text-xl font-bold tracking-tight">{titles[step]}</Dialog.Title>
              <Dialog.Description id="tutorial-description" className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {descriptions[step]}
              </Dialog.Description>

              {step === 2 && <div className="twinly-tutorial-demo" aria-live="polite">
                <Button
                  role="switch"
                  aria-checked={tutorialSleeping}
                  aria-label={`チュートリアル: ${tutorialSleeping ? "起床" : "入眠"}を記録・長押しで時刻指定`}
                  className={`relative h-20 w-full select-none overflow-hidden rounded-md p-0 shadow-sm [-webkit-touch-callout:none] ${
                    tutorialSleeping
                      ? "border-violet-500/60 [background:hsl(var(--gauge-sleep-track))] hover:[background:hsl(var(--gauge-sleep-track))]"
                      : "border-emerald-500/60 [background:hsl(var(--gauge-wake-track))] hover:[background:hsl(var(--gauge-wake-track))]"
                  }`}
                  onPointerDown={beginSleepLongPress}
                  onPointerUp={clearSleepLongPress}
                  onPointerLeave={clearSleepLongPress}
                  onPointerCancel={clearSleepLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={simulateShortSleepPress}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-0 ${
                      tutorialSleeping ? "[background:hsl(var(--gauge-sleep-fill))]" : "[background:hsl(var(--gauge-wake-fill))]"
                    }`}
                  />
                  {sleepTransition && <span role="status" className="sleep-transition-message absolute inset-0 z-20 grid place-items-center whitespace-normal px-3 text-center text-sm font-bold text-white">
                    {sleepTransition === "sleepStart" ? "入眠を記録しました · おやすみなさい" : "起床を記録しました · おはよう"}
                  </span>}
                  <span className="relative z-10 flex h-full w-full items-stretch">
                    <span
                      className={`flex h-full w-[38%] shrink-0 flex-col items-center justify-center px-2 ${
                        tutorialSleeping ? "[color:hsl(var(--gauge-sleep-on))]" : "[color:hsl(var(--gauge-wake-on))]"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-lg font-bold">
                        {tutorialSleeping ? <Moon className="h-5 w-5 shrink-0" /> : <Sun className="h-5 w-5 shrink-0" />}
                        <span>{tutorialSleeping ? "睡眠中" : "起床中"}</span>
                      </span>
                      <span className="mt-0.5 text-xs font-semibold opacity-80">長押しで時刻変更</span>
                    </span>
                    <span
                      className={`flex min-w-0 flex-1 flex-col items-end justify-center px-3 text-right text-[15px] font-bold leading-tight ${
                        tutorialSleeping ? "[color:hsl(var(--gauge-sleep-muted))]" : "[color:hsl(var(--gauge-wake-muted))]"
                      }`}
                    >
                      <span className="block">{tutorialSleeping ? "睡眠時間 0分" : "活動 未記録"}</span>
                      <span className="block">前回睡眠 未記録</span>
                    </span>
                  </span>
                </Button>
                <div className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold">
                  <Clock3 size={16} aria-hidden="true" />長押し 約0.5秒 → 時刻設定
                </div>
                <p className="mt-3 text-center text-xs text-muted-foreground">{status}</p>
                {practiced && <div className="twinly-tutorial-result mt-3">
                  <span className="flex items-center justify-center gap-1 text-sm font-bold">
                    <Check size={14} aria-hidden="true" />時刻設定まで完了
                  </span>
                </div>}
              </div>}

              {step === 3 && <div className="twinly-tutorial-demo" aria-live="polite">
                <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                  <Trash2 size={16} aria-hidden="true" />練習ログ → 削除 → 削除する
                </div>
                {fakeSleepEvent ? <div className="mt-3">
                  <EventCard event={fakeSleepEvent} onEdit={() => setFakeEditOpen(true)} />
                </div> : null}
                <p className="mt-3 text-center text-xs text-muted-foreground">{status}</p>
                {practiced && <div className="twinly-tutorial-result mt-3">
                  <span className="flex items-center justify-center gap-1 text-sm font-bold">
                    <Check size={14} aria-hidden="true" />練習ログを削除できました
                  </span>
                </div>}
              </div>}

              {isVoiceStep && <div className="twinly-tutorial-demo" aria-live="polite">
                <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                  <Mic size={16} aria-hidden="true" />
                  {step === 4 ? "「ミルク180」" : "「10分前 おしっこ」"}
                </div>
                <Button className="mt-3 w-full" variant="outline" size="sm" onClick={startTutorialVoice} disabled={voiceListening}>
                  {voiceListening ? "音声入力中…" : "マイクを起動して試す"}
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground">{status}</p>

                {practiced && voicePreviewEvents.length > 0 && <div className="mt-4">
                  {recognizedVoiceText && <div className="rounded-lg border bg-muted/40 px-3 py-2 text-center text-xs font-semibold">
                    認識：「{recognizedVoiceText}」
                  </div>}

                  {step === 5 && <div className="my-2 text-center text-[11px] font-semibold text-muted-foreground">
                    1回の音声入力 → 2人に同時追加
                  </div>}

                  <div className={`grid gap-2 ${step === 5 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {voicePreviewEvents.map((event) => {
                      const babyName = event.babyId === "A" ? names[0] : names[1];
                      return <div key={event.id} className="rounded-xl border bg-card p-3 text-left shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-bold">{babyName}</span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{formatClock(event.timestamp)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm font-bold">
                          {event.type === "milk" ? <Milk className="h-4 w-4 shrink-0" /> : <Droplets className="h-4 w-4 shrink-0" />}
                          <span>{event.type === "milk" ? "180ml・ミルク" : "おむつ・おしっこ"}</span>
                        </div>
                        {step === 5 && <div className="mt-1 text-[11px] font-semibold text-muted-foreground">10分前の時刻で追加</div>}
                      </div>;
                    })}
                  </div>

                  <div className="twinly-tutorial-result mt-3">
                    <span className="flex items-center justify-center gap-1 text-sm font-bold">
                      <Check size={14} aria-hidden="true" />
                      {step === 4 ? `${names[0]}だけに追加` : "2人それぞれに追加"}
                    </span>
                  </div>
                </div>}

                {!practiced && !voiceListening && <Button className="mt-2 w-full" variant="ghost" size="sm" onClick={skipPractice}>
                  この端末では今は試さない
                </Button>}
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  マイクと解析処理だけ本番と同じです。育児ログへの保存処理は呼びません。
                </p>
              </div>}

              {step === 6 && <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                {voiceExamples.map((example) => <div key={example} className="rounded-lg border bg-muted/50 px-3 py-2 font-medium">
                  「{example}」
                </div>)}
              </div>}

              {step === 7 && <p className="mt-4 rounded-xl bg-muted p-3 text-sm leading-relaxed">
                1人だけ音声入力 → 名前タブ<br />
                2人同時に音声入力 → 上のTwinly<br />
                間違えたら → 直後は「取り消す」、あとからはログを開く
              </p>}

              {step === 8 && <div className="twinly-tutorial-demo">
                <div className="overflow-hidden rounded-xl border bg-[#020817] shadow-sm">
                  <img
                    src="/tutorial/timeline.webp"
                    alt="1週間の育児記録を24時間軸で表示したタイムライン"
                    className="mx-auto block max-h-[44vh] w-auto max-w-full object-contain"
                  />
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="block font-bold">紫の帯 = 睡眠</span>
                    <span className="mt-1 block text-muted-foreground">睡眠と起床の流れを1週間で確認</span>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="block font-bold">下部 = 1日の睡眠合計</span>
                    <span className="mt-1 block text-muted-foreground">「12時間6分」など日ごとの合計を表示</span>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="block font-bold">左右スワイプ</span>
                    <span className="mt-1 block text-muted-foreground">{names[0]}と{names[1]}をすぐ切り替え</span>
                  </div>
                </div>
              </div>}

              {step === 9 && <div className="twinly-tutorial-demo">
                <div className="grid grid-cols-2 gap-2">
                  {premiumShots.map((shot) => <figure key={shot.src} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="aspect-[0.7] overflow-hidden bg-muted">
                      <img src={shot.src} alt={shot.alt} className="h-full w-full object-cover object-top" />
                    </div>
                    <figcaption className="px-2 py-1.5 text-center text-[11px] font-semibold">{shot.label}</figcaption>
                  </figure>)}
                </div>
                <div className="mt-3 rounded-xl border bg-muted/40 p-3 text-sm leading-relaxed">
                  <span className="font-bold">テーマ変更やAI機能も使えます。</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    気になったら、設定の「料金とプラン」から1週間無料で試せます。今すぐ登録する必要はありません。
                  </span>
                </div>
              </div>}

              {step === 10 && <div className="twinly-tutorial-demo">
                <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                  <SettingsIcon size={16} aria-hidden="true" />プロフィール設定を仕上げる
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  特に「表示名」「音声入力名」「生年月日」は最初に確認しておくのがおすすめです。
                </p>
                <Button className="mt-3 w-full" onClick={completeAndOpenSettings}>設定を開く</Button>
              </div>}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
                戻る
              </Button>
              {step < TOTAL_STEPS - 1 && <Button
                disabled={requiresPractice && !practiced}
                onClick={() => setStep((value) => value + 1)}
              >
                次へ
              </Button>}
              {step === TOTAL_STEPS - 1 && <Button onClick={completeAndOpenSettings}>設定を開いて完了</Button>}
            </div>
          </section>

          <div className="sr-only" aria-hidden="true">
            <VoiceCommandButton
              ref={tutorialVoiceRef}
              babyNames={{ A: [names[0]], B: [names[1]] }}
              onCommand={handleTutorialVoiceCommand}
              onMessage={handleTutorialVoiceMessage}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>}
    </Dialog.Root>

    <SleepRecordModal
      open={sleepModalOpen}
      onOpenChange={setSleepModalOpen}
      displayName={names[0]}
      type={sleepModalType}
      onSave={saveTutorialSleepTime}
    />

    <EditModal
      open={fakeEditOpen}
      onOpenChange={setFakeEditOpen}
      event={fakeSleepEvent}
      onSave={updateFakeSleepEvent}
      onDelete={deleteFakeSleepEvent}
    />
  </>;
}
