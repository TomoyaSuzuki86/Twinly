import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Clock3, Mic, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
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
type LivePause = "sleep" | "delete" | "cleanup" | null;

const activePanel = () =>
  document.querySelector<HTMLElement>('.twinly-baby-tabs-content[data-state="active"]');

const findActiveEvent = (prefix: "起床" | "入眠") =>
  Array.from(activePanel()?.querySelectorAll<HTMLButtonElement>('button[aria-label*="を編集"]') ?? [])
    .find((button) => button.getAttribute("aria-label")?.startsWith(prefix)) ?? null;

const findExactButton = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.trim() === text) ?? null;

const findDialogContaining = (text: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
    .find((dialog) => dialog.textContent?.includes(text)) ?? null;

const eventFingerprint = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>(
    '.twinly-baby-tabs-content button[aria-label*="を編集"]'
  ))
    .map((button) => button.getAttribute("aria-label") ?? "")
    .join("|");

const targetResolvers: Array<() => HTMLElement | null> = [
  () => document.querySelector<HTMLElement>('[data-tutorial="babies"]'),
  () => activePanel()?.querySelector<HTMLElement>('[aria-label^="食事を記録"]') ?? null,
  () => activePanel()?.querySelector<HTMLElement>('[role="switch"]') ?? null,
  () => findActiveEvent("起床"),
  () => document.querySelector<HTMLElement>('[data-tutorial="baby-A"]'),
  () => document.querySelector<HTMLElement>('[data-tutorial="header"]'),
  () => document.querySelector<HTMLElement>('[data-tutorial="header"]'),
  () => activePanel()?.querySelector<HTMLElement>('[data-tutorial="logs"]') ?? null,
  () => document.querySelector<HTMLElement>('[aria-label="settings"]'),
];

const TOTAL_STEPS = targetResolvers.length;
const scrollTargetIntoView = new Set([1, 2, 3, 7]);
const livePointerSteps = new Set([2, 4, 5]);
const voiceSteps = new Set([4, 5]);

export function IntroTutorial({ uid, ready, blocked, replay, names }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [practiced, setPracticed] = useState(false);
  const [status, setStatus] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const [sleepReady, setSleepReady] = useState(false);
  const [livePause, setLivePause] = useState<LivePause>(null);
  const [voiceWatching, setVoiceWatching] = useState(false);

  const checked = useRef(false);
  const replaySeen = useRef(0);
  const sleepPreparedRef = useRef(false);
  const tutorialSleepStartCreatedRef = useRef(false);
  const tutorialWakeCreatedRef = useRef(false);
  const sleepWatchTimerRef = useRef<number | null>(null);
  const deleteWatchTimerRef = useRef<number | null>(null);
  const cleanupTimerRef = useRef<number | null>(null);
  const voiceBaselineRef = useRef("");
  const voiceStartedAtRef = useRef(0);
  const voiceHadListeningRef = useRef(false);

  const clearTimer = (ref: MutableRefObject<number | null>) => {
    if (ref.current !== null) window.clearInterval(ref.current);
    ref.current = null;
  };

  const clearWatchers = () => {
    clearTimer(sleepWatchTimerRef);
    clearTimer(deleteWatchTimerRef);
    clearTimer(cleanupTimerRef);
  };

  const resetSession = () => {
    clearWatchers();
    setStep(0);
    setPracticed(false);
    setStatus("");
    setSleepReady(false);
    setLivePause(null);
    setVoiceWatching(false);
    sleepPreparedRef.current = false;
    tutorialSleepStartCreatedRef.current = false;
    tutorialWakeCreatedRef.current = false;
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

  useEffect(() => () => clearWatchers(), []);

  useEffect(() => {
    if (!open || livePause) return;

    const measure = () => {
      const target = targetResolvers[step]?.();
      if (scrollTargetIntoView.has(step)) {
        target?.scrollIntoView?.({ block: "center", behavior: "instant" });
      } else if (step !== 3) {
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
  }, [open, step, livePause]);

  useEffect(() => {
    if (!open) return;
    setPracticed(false);
    setStatus("");
    setVoiceWatching(false);

    if (step === 2) {
      setSleepReady(false);
      if (!sleepPreparedRef.current) {
        const sleepButton = targetResolvers[2]?.() as HTMLButtonElement | null;
        if (!sleepButton) {
          setStatus("睡眠管理がオフのため、この手順はスキップできます。");
          setPracticed(true);
          return;
        }
        sleepPreparedRef.current = true;

        if (sleepButton.getAttribute("aria-checked") !== "true") {
          tutorialSleepStartCreatedRef.current = true;
          setStatus("練習用に一度「入眠」を記録して、起床操作を試せる状態にしています…");
          sleepButton.click();
        } else {
          setStatus("現在の睡眠状態を使って、実際に起床を記録します。");
        }
      }

      const readyTimer = window.setInterval(() => {
        const sleepButton = targetResolvers[2]?.() as HTMLButtonElement | null;
        if (
          sleepButton &&
          sleepButton.getAttribute("aria-checked") === "true" &&
          !sleepButton.disabled
        ) {
          window.clearInterval(readyTimer);
          setSleepReady(true);
          setStatus("準備できました。光っている睡眠ボタンを約0.5秒長押ししてください。");
        }
      }, 100);
      return () => window.clearInterval(readyTimer);
    }

    if (step === 3 && !tutorialWakeCreatedRef.current) {
      setStatus("起床記録が見つかりません。前の手順で起床を記録してから進んでください。");
    }

    if (voiceSteps.has(step)) {
      setStatus("ここで話した内容は実際の記録として保存されます。");
    }
  }, [step, open]);

  useEffect(() => {
    if (!voiceWatching) return;

    const timer = window.setInterval(() => {
      const listening = Boolean(document.querySelector('button[aria-label="stop voice input"]'));
      if (listening) {
        voiceHadListeningRef.current = true;
        setStatus("聞き取り中です。記録したい内容を話してください。");
      }

      const changed = eventFingerprint() !== voiceBaselineRef.current;
      if (changed) {
        window.clearInterval(timer);
        setVoiceWatching(false);
        setPracticed(true);
        setStatus("実際に記録できました。ログにも保存されています。");
        return;
      }

      const elapsed = Date.now() - voiceStartedAtRef.current;
      if (voiceHadListeningRef.current && !listening && elapsed > 1800) {
        window.clearInterval(timer);
        setVoiceWatching(false);
        setStatus("記録まで完了しませんでした。もう一度試すか、この手順をスキップできます。");
        return;
      }

      if (elapsed > 23000) {
        window.clearInterval(timer);
        setVoiceWatching(false);
        setStatus("音声入力が完了しませんでした。もう一度試すか、この手順をスキップできます。");
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [voiceWatching]);

  const startVoiceWatch = () => {
    if (voiceWatching) return;
    voiceBaselineRef.current = eventFingerprint();
    voiceStartedAtRef.current = Date.now();
    voiceHadListeningRef.current = false;
    setVoiceWatching(true);
    setStatus("マイクを起動しています…");
  };

  const watchSleepDialog = () => {
    clearTimer(sleepWatchTimerRef);
    const startedAt = Date.now();
    let dialogSeen = false;

    sleepWatchTimerRef.current = window.setInterval(() => {
      const dialog = findDialogContaining("起床時刻");
      if (dialog) {
        dialogSeen = true;
        setLivePause("sleep");
        return;
      }

      if (dialogSeen) {
        clearTimer(sleepWatchTimerRef);
        const wake = findActiveEvent("起床");
        setLivePause(null);
        if (wake) {
          tutorialWakeCreatedRef.current = true;
          setPracticed(true);
          setStatus("起床を実際に記録しました。次は、この記録をログから削除します。");
        } else {
          setPracticed(false);
          setStatus("起床の記録はキャンセルされました。もう一度、睡眠ボタンを長押ししてください。");
        }
        return;
      }

      if (Date.now() - startedAt > 2500) {
        clearTimer(sleepWatchTimerRef);
        setStatus("長押しが短かったようです。約0.5秒押し続けてください。");
      }
    }, 100);
  };

  const autoDeleteEvent = (
    prefix: "起床" | "入眠",
    onDone: (deleted: boolean) => void
  ) => {
    const eventButton = findActiveEvent(prefix);
    if (!eventButton) {
      onDone(false);
      return;
    }

    eventButton.click();
    setLivePause("cleanup");
    clearTimer(cleanupTimerRef);

    const startedAt = Date.now();
    let deleteClicked = false;
    let confirmClicked = false;

    cleanupTimerRef.current = window.setInterval(() => {
      const dialog = findDialogContaining("記録の編集");
      if (dialog) {
        if (!deleteClicked) {
          const deleteButton = findExactButton(dialog, "削除");
          if (deleteButton) {
            deleteButton.click();
            deleteClicked = true;
          }
          return;
        }
        if (!confirmClicked) {
          const confirmButton = findExactButton(dialog, "削除する");
          if (confirmButton) {
            confirmButton.click();
            confirmClicked = true;
          }
        }
        return;
      }

      if (confirmClicked) {
        clearTimer(cleanupTimerRef);
        onDone(true);
        return;
      }

      if (Date.now() - startedAt > 4000) {
        clearTimer(cleanupTimerRef);
        onDone(false);
      }
    }, 80);
  };

  const cleanupTutorialSleepArtifacts = (onDone: () => void) => {
    const deleteSleepStart = () => {
      if (!tutorialSleepStartCreatedRef.current) {
        setLivePause(null);
        onDone();
        return;
      }
      autoDeleteEvent("入眠", () => {
        tutorialSleepStartCreatedRef.current = false;
        setLivePause(null);
        onDone();
      });
    };

    if (!tutorialWakeCreatedRef.current) {
      deleteSleepStart();
      return;
    }

    autoDeleteEvent("起床", () => {
      tutorialWakeCreatedRef.current = false;
      deleteSleepStart();
    });
  };

  const finish = (outcome: TutorialOutcome, after?: () => void) => {
    clearWatchers();
    setVoiceWatching(false);

    const finalize = () => {
      setOpen(false);
      setLivePause(null);
      void finishTutorial(uid, outcome);
      window.scrollTo({ top: 0, behavior: "instant" });
      after?.();
    };

    if (tutorialWakeCreatedRef.current || tutorialSleepStartCreatedRef.current) {
      cleanupTutorialSleepArtifacts(finalize);
      return;
    }
    finalize();
  };

  const beginDeleteWake = () => {
    const wake = findActiveEvent("起床");
    if (!wake) {
      setStatus("削除する起床記録が見つかりません。");
      return;
    }

    const label = wake.getAttribute("aria-label") ?? "";
    wake.click();
    setLivePause("delete");
    clearTimer(deleteWatchTimerRef);

    const startedAt = Date.now();
    let dialogSeen = false;

    deleteWatchTimerRef.current = window.setInterval(() => {
      const dialog = findDialogContaining("記録の編集");
      if (dialog) {
        dialogSeen = true;
        return;
      }

      if (dialogSeen) {
        clearTimer(deleteWatchTimerRef);
        const stillExists = Array.from(
          activePanel()?.querySelectorAll<HTMLButtonElement>('button[aria-label*="を編集"]') ?? []
        ).some((button) => button.getAttribute("aria-label") === label);

        if (stillExists) {
          setLivePause(null);
          setPracticed(false);
          setStatus("削除はキャンセルされました。起床の記録をもう一度開いて削除してください。");
          return;
        }

        tutorialWakeCreatedRef.current = false;
        if (tutorialSleepStartCreatedRef.current) {
          setStatus("起床を削除できました。練習用に作った入眠記録を片付けています…");
          autoDeleteEvent("入眠", () => {
            tutorialSleepStartCreatedRef.current = false;
            setLivePause(null);
            setPracticed(true);
            setStatus("削除できました。ログから記録を編集・削除する方法もこれで完了です。");
          });
        } else {
          setLivePause(null);
          setPracticed(true);
          setStatus("削除できました。元の睡眠状態にも戻っています。");
        }
        return;
      }

      if (Date.now() - startedAt > 4000) {
        clearTimer(deleteWatchTimerRef);
        setLivePause(null);
        setStatus("記録の編集画面を開けませんでした。もう一度試してください。");
      }
    }, 100);
  };

  const forwardPointer = (
    type: "pointerdown" | "pointerup" | "pointerleave" | "pointercancel",
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!livePointerSteps.has(step)) return;
    if (step === 2 && !sleepReady) return;
    const target = targetResolvers[step]?.();
    if (!target) return;

    if (voiceSteps.has(step) && type === "pointerdown") startVoiceWatch();

    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: event.button,
    }));

    if (step === 2 && type === "pointerdown") watchSleepDialog();
  };

  const forwardDoubleClick = () => {
    if (!voiceSteps.has(step)) return;
    const target = targetResolvers[step]?.();
    if (!target) return;
    startVoiceWatch();
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 }));
  };

  const startVoiceFromButton = () => {
    const target = targetResolvers[step]?.();
    if (!target) {
      setStatus("音声入力を開始できる場所が見つかりません。");
      return;
    }
    startVoiceWatch();
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 }));
  };

  const titles = [
    "まずは、記録する子を選ぶ",
    "基本の記録は、ボタンから",
    "睡眠は、実際に起床を記録してみる",
    "今の起床記録を、ログから消してみる",
    "この子だけに、実際に声で記録",
    "2人分も、実際に声で記録",
    "声では、時刻までまとめて言えます",
    "記録は、あとから直せます",
    "最後に、設定を確認",
  ];

  const descriptions = [
    "名前のタブをタップ、または画面を左右にスワイプして切り替えます。横長画面で2人が左右に並ぶときは、切り替えずそれぞれの側で記録できます。",
    "食事・おむつはボタンを押して内容を選び、保存します。睡眠は1回押すと現在時刻、長押しすると時刻を指定して記録できます。ゲージや前回時刻は、次の記録タイミングの目安です。",
    "光っている睡眠ボタンを長押ししてください。実際の「起床時刻」画面が開くので、時刻を確認して「記録する」を押します。この起床は本当にログへ保存されます。",
    "さっき作った「起床」のログを開いてください。実際の編集画面で「削除」→「削除する」と進みます。これで、間違えた記録を後から消す方法も覚えられます。",
    `${names[0]}の名前を長押し、またはダブルタップすると、本物の音声入力が始まります。今ちょうど記録したい内容を話してみてください。名前を言わなくても${names[0]}だけに保存されます。`,
    "画面上部のTwinlyを長押し、またはダブルタップすると、2人同時の音声入力です。名前を言わずに「ミルク180」なら、2人それぞれへ180mlを実際に保存します。",
    "音声入力はミルクだけではありません。おむつ・離乳食・入眠・起床にも対応し、「30分前」「8時30分」のように時刻まで一緒に話せます。",
    "保存直後なら「取り消す」で戻せます。あとからはログを開いて編集・削除できます。タイムラインでも左右スワイプで表示する子を切り替えられます。",
    "設定では、2人の表示名・音声入力名・生年月日・アイコン・ミルクや睡眠の目安などを自分たちに合わせられます。最後にプロフィール設定を一度確認しておきましょう。",
  ];

  const voiceExamples = [
    "ミルク180",
    "おしっこ",
    "うんち",
    "離乳食",
    "寝た / 起きた",
    "30分前にミルク180",
    "8時30分におしっこ",
  ];

  const requiresPractice = step === 2 || step === 3 || step === 4 || step === 5;
  const interactive = livePointerSteps.has(step) || step === 3 || step === 8;
  const isVoiceStep = voiceSteps.has(step);

  const spotlightLabel =
    step === 2 ? "睡眠ボタンを実際に長押し" :
    step === 3 ? "起床記録を開く" :
    step === 4 ? `${names[0]}の音声入力を開始` :
    step === 5 ? "2人同時の音声入力を開始" :
    step === 8 ? "設定を開く" :
    "チュートリアル対象";

  const skipPractice = () => {
    setVoiceWatching(false);
    setPracticed(true);
    setStatus("この手順はスキップしました。実際の操作はあとからいつでも試せます。");
  };

  const completeAndOpenSettings = () => {
    const settingsButton = targetResolvers[8]?.();
    finish("completed", () => {
      window.setTimeout(() => settingsButton?.click(), 0);
    });
  };

  return <Dialog.Root open={open} onOpenChange={(value) => { if (!value) finish("skipped"); }}>
    {!livePause && <Dialog.Portal>
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
          tabIndex={interactive ? 0 : -1}
          disabled={!interactive}
          aria-label={spotlightLabel}
          onPointerDown={(event) => forwardPointer("pointerdown", event)}
          onPointerUp={(event) => forwardPointer("pointerup", event)}
          onPointerLeave={(event) => forwardPointer("pointerleave", event)}
          onPointerCancel={(event) => forwardPointer("pointercancel", event)}
          onDoubleClick={forwardDoubleClick}
          onClick={() => {
            if (step === 3) beginDeleteWake();
            if (step === 8) completeAndOpenSettings();
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
              <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                <Clock3 size={16} aria-hidden="true" />長押し 約0.5秒 → 起床時刻
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">{status}</p>
              {practiced && <div className="twinly-tutorial-result mt-3">
                <span className="flex items-center justify-center gap-1 text-sm font-bold">
                  <Check size={14} aria-hidden="true" />起床を実際に保存しました
                </span>
              </div>}
            </div>}

            {step === 3 && <div className="twinly-tutorial-demo" aria-live="polite">
              <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                <Trash2 size={16} aria-hidden="true" />起床ログ → 削除 → 削除する
              </div>
              <Button className="mt-3 w-full" variant="outline" size="sm" onClick={beginDeleteWake} disabled={!tutorialWakeCreatedRef.current}>
                起床の記録を開く
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">{status}</p>
              {practiced && <div className="twinly-tutorial-result mt-3">
                <span className="flex items-center justify-center gap-1 text-sm font-bold">
                  <Check size={14} aria-hidden="true" />ログから削除できました
                </span>
              </div>}
            </div>}

            {isVoiceStep && <div className="twinly-tutorial-demo" aria-live="polite">
              <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                <Mic size={16} aria-hidden="true" />例：「ミルク180」
              </div>
              <Button className="mt-3 w-full" variant="outline" size="sm" onClick={startVoiceFromButton} disabled={voiceWatching}>
                {voiceWatching ? "音声入力中…" : "実際に音声入力を開始"}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">{status}</p>
              {practiced && <div className="twinly-tutorial-result mt-3">
                <span className="flex items-center justify-center gap-1 text-sm font-bold">
                  <Check size={14} aria-hidden="true" />実際の記録として保存できました
                </span>
              </div>}
              {!practiced && !voiceWatching && <Button className="mt-2 w-full" variant="ghost" size="sm" onClick={skipPractice}>
                この端末では今は試さない
              </Button>}
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                テスト用に記録した場合は、さきほど覚えたログ編集から削除できます。
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
            <Button variant="ghost" disabled={step === 0 || livePause !== null} onClick={() => setStep((value) => value - 1)}>
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
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
