import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Clock3, Mic } from "lucide-react";
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

const selectors = [
  '[data-tutorial="babies"]',
  '.twinly-baby-tabs-content[data-state="active"] [aria-label^="食事を記録"]',
  '.twinly-baby-tabs-content[data-state="active"] [role="switch"]',
  '[data-tutorial="baby-A"]',
  '[data-tutorial="header"]',
  '[data-tutorial="header"]',
  '.twinly-baby-tabs-content[data-state="active"] [data-tutorial="logs"]',
];

const TOTAL_STEPS = selectors.length;
const scrollTargetIntoView = new Set([1, 2, 6]);
const interactiveSteps = new Set([2, 3, 4]);
const voiceSteps = new Set([3, 4]);

export function IntroTutorial({ uid, ready, blocked, replay, names }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [practiced, setPracticed] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const checked = useRef(false);
  const replaySeen = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const gestureDone = useRef(false);
  const activeGesture = useRef(false);

  const clearPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    if (!ready || blocked || checked.current) return;
    let cancelled = false;
    void shouldShowTutorial(uid).then(show => {
      if (cancelled) return;
      checked.current = true;
      if (show && replaySeen.current === 0) setOpen(true);
    });
    return () => { cancelled = true; };
  }, [uid, ready, blocked]);

  useEffect(() => {
    if (!replay || replay === replaySeen.current || blocked) return;
    replaySeen.current = replay;
    setStep(0);
    setPracticed(false);
    setOpen(true);
  }, [replay, blocked]);

  useEffect(() => {
    setPracticed(false);
    lastTap.current = 0;
    clearPress();
    gestureDone.current = false;
    activeGesture.current = false;
    return clearPress;
  }, [step, open]);

  useEffect(() => {
    if (!open) return;
    const target = document.querySelector<HTMLElement>(selectors[step]);
    if (scrollTargetIntoView.has(step)) target?.scrollIntoView?.({ block: "center", behavior: "instant" });
    else window.scrollTo({ top: 0, behavior: "instant" });

    const measure = () => {
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
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (target) observer?.observe(target);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  const finish = (outcome: TutorialOutcome) => {
    clearPress();
    setOpen(false);
    finishTutorial(uid, outcome);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const practice = () => {
    clearPress();
    gestureDone.current = true;
    setPracticed(true);
  };

  const titles = [
    "まずは、記録する子を選ぶ",
    "基本の記録は、ボタンから",
    "睡眠だけは、長押しも覚える",
    "この子だけに、声で記録",
    "2人分を、ひとことで",
    "声では、時刻までまとめて言えます",
    "記録は、あとから直せます",
  ];

  const descriptions = [
    "名前のタブをタップ、または画面を左右にスワイプして切り替えます。横長画面で2人が左右に並ぶときは、切り替えずそれぞれの側で記録できます。",
    "食事・おむつはボタンを押して内容を選び、保存します。睡眠はボタンを1回押すと、その時刻で入眠／起床を記録します。ボタン内のゲージや前回時刻は、次の記録タイミングの目安です。",
    "睡眠ボタンを長押しすると、入眠／起床した時刻を指定できます。寝かしつけや対応が終わってから、少し前の時刻で記録したいときに使えます。",
    `${names[0]}の名前を長押し、またはダブルタップ。「ミルク180」と話せば、名前を言わなくてもこの子だけに記録できます。`,
    "画面上部のTwinlyを長押し、またはダブルタップ。名前を言わずに「ミルク180」と話すと、2人それぞれに180mlを同時に記録できます。",
    "音声入力はミルクだけではありません。おむつ・離乳食・入眠・起床にも対応し、「30分前」「8時30分」のように時刻を含めて記録できます。",
    "保存直後なら「取り消す」で戻せます。あとから直すときはログの記録を開いて編集します。タイムラインも左右スワイプで表示する子を切り替えられます。",
  ];

  const interactive = interactiveSteps.has(step);
  const isVoiceStep = voiceSteps.has(step);
  const isSleepStep = step === 2;

  const spotlightLabel = isSleepStep
    ? "睡眠の長押しを練習"
    : step === 3
      ? `${names[0]}の音声入力を練習`
      : "2人同時の音声入力を練習";

  const voiceExamples = [
    "ミルク180",
    "おしっこ",
    "うんち",
    "離乳食",
    "寝た / 起きた",
    "30分前にミルク180",
    "8時30分におしっこ",
  ];

  return <Dialog.Root open={open} onOpenChange={value => { if (!value) finish("skipped"); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="twinly-tutorial-backdrop" />
      <Dialog.Content
        className="twinly-tutorial"
        onPointerDownOutside={event => event.preventDefault()}
        aria-describedby="tutorial-description"
      >
        {rect && <button
          type="button"
          className="twinly-tutorial-spotlight"
          style={rect}
          tabIndex={interactive ? 0 : -1}
          disabled={!interactive}
          aria-label={spotlightLabel}
          onPointerDown={event => {
            if (!interactive || !event.isPrimary || event.button !== 0) return;
            clearPress();
            gestureDone.current = false;
            activeGesture.current = true;
            timer.current = setTimeout(practice, 550);
          }}
          onPointerUp={() => {
            clearPress();
            if (!interactive || !activeGesture.current) return;
            activeGesture.current = false;
            if (gestureDone.current) {
              lastTap.current = 0;
              return;
            }
            if (!isVoiceStep) {
              lastTap.current = 0;
              return;
            }
            const now = Date.now();
            if (lastTap.current && now - lastTap.current < 350) {
              practice();
              lastTap.current = 0;
            } else {
              lastTap.current = now;
            }
          }}
          onPointerLeave={() => {
            clearPress();
            activeGesture.current = false;
            lastTap.current = 0;
          }}
          onPointerCancel={() => {
            clearPress();
            activeGesture.current = false;
            lastTap.current = 0;
          }}
          onDoubleClick={() => { if (isVoiceStep) practice(); }}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              practice();
            }
          }}
          onContextMenu={event => event.preventDefault()}
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

            {isSleepStep && <div className="twinly-tutorial-demo" aria-live="polite">
              <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                <Clock3 size={16} aria-hidden="true" />長押し 約0.5秒
              </div>
              {practiced ? <div className="twinly-tutorial-result mt-3">
                <span className="flex items-center justify-center gap-1 text-sm font-bold">
                  <Check size={14} aria-hidden="true" />時刻を指定して記録
                </span>
              </div> : <Button className="mt-3 w-full" variant="outline" size="sm" onClick={practice}>長押し後の動きを見る</Button>}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {practiced ? "練習できました。実際の睡眠記録には保存されません。" : "光っている睡眠ボタンを長押しして試せます。"}
              </p>
            </div>}

            {isVoiceStep && <div className="twinly-tutorial-demo" aria-live="polite">
              <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                <Mic size={16} aria-hidden="true" />「ミルク180」
              </div>
              {practiced ? <div
                className="mt-3 grid gap-2"
                style={{ gridTemplateColumns: step === 4 ? "repeat(2, minmax(0, 1fr))" : "1fr" }}
              >
                {(step === 4 ? names : names.slice(0, 1)).map((name, index) => <div key={index} className="twinly-tutorial-result">
                  <span className="block truncate text-xs">{name}</span>
                  <span className="mt-1 flex items-center justify-center gap-1 text-sm font-bold">
                    <Check size={14} aria-hidden="true" />180 ml
                  </span>
                </div>)}
              </div> : <Button className="mt-3 w-full" variant="outline" size="sm" onClick={practice}>記録例を見る</Button>}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {practiced ? "練習できました。実際の記録には保存されません。" : "光っている場所で操作を試せます。声は出さなくて大丈夫。"}
              </p>
            </div>}

            {step === 5 && <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {voiceExamples.map(example => <div key={example} className="rounded-lg border bg-muted/50 px-3 py-2 font-medium">
                「{example}」
              </div>)}
            </div>}

            {step === 6 && <p className="mt-4 rounded-xl bg-muted p-3 text-sm leading-relaxed">
              1人だけ音声入力 → 名前タブ<br />
              2人同時に音声入力 → 上のTwinly<br />
              この使い方は設定からいつでも見返せます。
            </p>}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(value => value - 1)}>戻る</Button>
            <Button onClick={() => step === TOTAL_STEPS - 1 ? finish("completed") : setStep(value => value + 1)}>
              {step === TOTAL_STEPS - 1 ? "記録をはじめる" : "次へ"}
            </Button>
          </div>
        </section>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
