import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Mic } from "lucide-react";
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
  '[data-tutorial="babies"]', '[data-tutorial="baby-A"]',
  '[data-tutorial="header"]', '.twinly-baby-tabs-content[data-state="active"] [data-tutorial="logs"]',
];

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
  const clearPress = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };

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
    setStep(0); setPracticed(false); setOpen(true);
  }, [replay, blocked]);

  useEffect(() => {
    setPracticed(false); lastTap.current = 0; clearPress();
    gestureDone.current = false; activeGesture.current = false;
    return clearPress;
  }, [step, open]);

  useEffect(() => {
    if (!open) return;
    const target = document.querySelector<HTMLElement>(selectors[step]);
    if (step === 3) target?.scrollIntoView?.({ block: "center", behavior: "instant" });
    else window.scrollTo({ top: 0, behavior: "instant" });
    const measure = () => {
      const box = target?.getBoundingClientRect();
      if (!box || !box.width || !box.height) { setRect(null); return; }
      const left = Math.max(8, box.left - 4);
      const top = Math.max(8, box.top - 4);
      setRect({ top, left, width: Math.min(box.width + 8, window.innerWidth - left - 8), height: box.height + 8 });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (target) observer?.observe(target);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, step]);

  const finish = (outcome: TutorialOutcome) => {
    clearPress(); setOpen(false); finishTutorial(uid, outcome);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const practice = () => { clearPress(); gestureDone.current = true; setPracticed(true); };
  const titles = ["まずは、記録する子を選ぶ", "この子だけに、声で記録", "2人分を、ひとことで", "記録は、あとから確認できます"];
  const descriptions = [
    "名前のタブで切り替えて、食事・おむつ・睡眠のボタンから記録できます。左右2人表示では、それぞれの側で記録します。",
    `${names[0]}の名前を長押し、またはダブルタップ。「ミルク180」と話せば、名前を言わなくてもこの子に記録できます。`,
    "画面上部のTwinlyを長押し、またはダブルタップ。名前を言わずに「ミルク180」と話すと、2人それぞれに180mlを記録できます。",
    "保存した内容はログに並びます。間違えた直後は「取り消す」、あとからは記録を開いて編集できます。",
  ];
  const interactive = step === 1 || step === 2;
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) finish("skipped"); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="twinly-tutorial-backdrop" />
      <Dialog.Content className="twinly-tutorial" onPointerDownOutside={event => event.preventDefault()} aria-describedby="tutorial-description">
        {rect && <button type="button" className="twinly-tutorial-spotlight" style={rect}
          tabIndex={interactive ? 0 : -1} disabled={!interactive}
          aria-label={step === 1 ? `${names[0]}の音声入力を練習` : "2人同時の音声入力を練習"}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0) return;
            clearPress(); gestureDone.current = false; activeGesture.current = true;
            timer.current = setTimeout(practice, 550);
          }}
          onPointerUp={() => {
            clearPress(); if (!activeGesture.current) return; activeGesture.current = false;
            if (gestureDone.current) { lastTap.current = 0; return; }
            const now = Date.now();
            if (lastTap.current && now - lastTap.current < 350) { practice(); lastTap.current = 0; }
            else lastTap.current = now;
          }}
          onPointerLeave={() => { clearPress(); activeGesture.current = false; lastTap.current = 0; }}
          onPointerCancel={() => { clearPress(); activeGesture.current = false; lastTap.current = 0; }}
          onDoubleClick={practice}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); practice(); } }}
          onContextMenu={event => event.preventDefault()} />}
        <section className="twinly-tutorial-card">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">使い方 <span className="ml-2">{step + 1} / 4</span></span>
            <Button variant="ghost" size="sm" onClick={() => finish("skipped")}>スキップ</Button>
          </div>
          <div key={step} className="twinly-tutorial-copy">
            <Dialog.Title className="text-xl font-bold tracking-tight">{titles[step]}</Dialog.Title>
            <Dialog.Description id="tutorial-description" className="mt-3 text-sm leading-relaxed text-muted-foreground">{descriptions[step]}</Dialog.Description>
            {interactive && <div className="twinly-tutorial-demo" aria-live="polite">
              <div className="flex items-center justify-center gap-2 text-sm font-semibold"><Mic size={16} aria-hidden="true" />「ミルク180」</div>
              {practiced ? <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: step === 2 ? "repeat(2, minmax(0, 1fr))" : "1fr" }}>
                {(step === 2 ? names : names.slice(0, 1)).map((name, index) => <div key={index} className="twinly-tutorial-result">
                  <span className="block truncate text-xs">{name}</span>
                  <span className="mt-1 flex items-center justify-center gap-1 text-sm font-bold"><Check size={14} aria-hidden="true" />180 ml</span>
                </div>)}
              </div> : <Button className="mt-3 w-full" variant="outline" size="sm" onClick={practice}>記録例を見る</Button>}
              <p className="mt-3 text-center text-xs text-muted-foreground">{practiced ? "練習できました。実際の記録には保存されません。" : "光っている場所で操作を試せます。声は出さなくて大丈夫。"}</p>
            </div>}
            {step === 3 && <p className="mt-4 rounded-xl bg-muted p-3 text-sm leading-relaxed">1人なら名前のタブ、2人なら上のTwinly。<br />使い方は設定からいつでも見返せます。</p>}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(value => value - 1)}>戻る</Button>
            <Button onClick={() => step === 3 ? finish("completed") : setStep(value => value + 1)}>{step === 3 ? "記録をはじめる" : "次へ"}</Button>
          </div>
        </section>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
