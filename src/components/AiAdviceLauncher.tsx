import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import type { AiQuestionAnswer, AiReview, FamilyAccess } from "@/lib/ai";
import { callService } from "@/lib/ai";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { VoiceCommandButton } from "./VoiceCommandButton";

const TARGET_SELECTOR = 'button[aria-label="週間タイムラインを開く"]';
const CONSENT_KEY = "twinly-ai-review-consent-v3";
const JST = 9 * 60 * 60 * 1000;
const dayKey = (timestamp = Date.now()) => new Date(timestamp + JST).toISOString().slice(0, 10);

export function AiAdviceLauncher() {
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const targetMap = useRef(new Map<HTMLButtonElement, HTMLSpanElement>());
  const [access, setAccess] = useState<FamilyAccess | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<AiReview | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AiQuestionAnswer | null>(null);
  const [consent, setConsent] = useState(() => {
    try { return window.localStorage.getItem(CONSENT_KEY) === "yes"; } catch { return false; }
  });
  const [consentChecked, setConsentChecked] = useState(consent);
  const inFlight = useRef(false);

  useEffect(() => {
    const syncTargets = () => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(TARGET_SELECTOR));
      const live = new Set(buttons);
      for (const [button, target] of targetMap.current) {
        if (!live.has(button) || !button.isConnected) {
          target.remove();
          targetMap.current.delete(button);
        }
      }
      for (const button of buttons) {
        if (targetMap.current.has(button) || !button.parentElement) continue;
        const target = document.createElement("span");
        target.className = "ml-auto inline-flex shrink-0";
        target.dataset.twinlyAiAdviceTarget = "true";
        button.parentElement.insertBefore(target, button);
        targetMap.current.set(button, target);
      }
      const next = Array.from(targetMap.current.values());
      setTargets((current) => current.length === next.length && current.every((target, index) => target === next[index]) ? current : next);
    };
    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const target of targetMap.current.values()) target.remove();
      targetMap.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!targets.length) { setAccess(null); return; }
    let active = true;
    const refresh = async () => {
      try {
        const next = await callService<FamilyAccess>("getFamilyAccess");
        if (active) setAccess(next);
      } catch {
        if (active) setAccess(null);
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [targets.length]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (review && dayKey(review.generatedAt) !== dayKey()) {
        setReview(null);
        setAnswer(null);
        setQuestion("");
      }
    }, 60000);
    return () => window.clearInterval(interval);
  }, [review]);

  const loadReview = async () => {
    if (inFlight.current) return;
    if (review && dayKey(review.generatedAt) === dayKey()) return;
    inFlight.current = true;
    setBusy(true);
    setBusyText("直近2週間を確認しています…");
    setError("");
    try {
      const next = await callService<AiReview>("twinlyAi", { mode: "review" });
      setReview(next);
      setAnswer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AIアドバイスを取得できませんでした");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setBusyText("");
    }
  };

  const askQuestion = async () => {
    const value = question.trim();
    if (!value || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setBusyText("AIが記録を確認しています…");
    setError("");
    try {
      const next = await callService<AiQuestionAnswer>("twinlyAi", { mode: "ask", question: value });
      setAnswer(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "質問に回答できませんでした");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setBusyText("");
    }
  };

  const openAdvice = () => {
    setOpen(true);
    setError("");
    if (consent) void loadReview();
  };

  const acceptAndLoad = () => {
    try { window.localStorage.setItem(CONSENT_KEY, "yes"); } catch {}
    setConsent(true);
    setConsentChecked(true);
    void loadReview();
  };

  const launcher = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1 px-2 text-xs"
      onClick={openAdvice}
      aria-label="AIアドバイスを見る"
    >
      <Sparkles className="h-4 w-4" />
      <span>AIアドバイス</span>
    </Button>
  );

  return (
    <>
      {access?.features.aiReview ? targets.map((target, index) => createPortal(launcher, target, `ai-advice-${index}`)) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>今日のAIアドバイス</DialogTitle>
            <DialogDescription>
              今日を除く直近14日を中心に、双子の変化と比較から今日見るポイントをまとめます。
            </DialogDescription>
          </DialogHeader>

          {!consent ? (
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-sm leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                />
                <span>
                  AIアドバイス・質問時、GoogleのAPIへ質問文、赤ちゃんの登録名、生年月日、直近2週間の育児集計を送信し、質問に必要な場合のみ時系列記録も追加送信することに同意します。
                </span>
              </label>
              <Button disabled={!consentChecked || busy} onClick={acceptAndLoad}>同意してアドバイスを見る</Button>
            </div>
          ) : null}

          {consent && !review && !busy ? (
            <Button onClick={() => void loadReview()}>AIアドバイスを生成・表示</Button>
          ) : null}

          {busy ? <p role="status" className="text-sm text-muted-foreground">{busyText}</p> : null}
          {error ? <p role="alert" className="rounded-lg border p-3 text-sm">{error}</p> : null}

          {review ? (
            <div className="space-y-4 whitespace-pre-wrap text-sm leading-relaxed">
              <section className="rounded-lg border bg-card p-4">
                <h3 className="mb-2 font-bold">最近の傾向</h3>
                <p>{review.observations}</p>
              </section>
              <section className="rounded-lg border bg-card p-4">
                <h3 className="mb-2 font-bold">今日のポイント</h3>
                <p>{review.checks}</p>
              </section>

              {access?.features.aiChat ? (
                <section className="space-y-3 rounded-lg border bg-card p-4">
                  <div>
                    <h3 className="font-bold">AIに質問する</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      まず上のAIアドバイスと集計済みデータから回答し、時刻や前後関係の確認が必要な質問だけ記録を追加確認します。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!busy ? <VoiceCommandButton onCommand={()=>{}} onMessage={setError} onTranscript={(value)=>{setQuestion(value);setAnswer(null);}}/> : null}
                    <span className="text-xs text-muted-foreground">音声でも質問できます</span>
                  </div>
                  <textarea
                    aria-label="AIへの質問"
                    className="w-full rounded border bg-background p-2"
                    rows={2}
                    maxLength={500}
                    disabled={busy}
                    value={question}
                    placeholder="例：最近、日向の睡眠時間は減ってる？"
                    onChange={(event)=>{setQuestion(event.target.value);setAnswer(null);}}
                  />
                  <Button disabled={busy||!question.trim()} onClick={()=>void askQuestion()}>質問する</Button>
                  {answer ? (
                    <div className="space-y-1 rounded-lg bg-muted/40 p-3">
                      <p>{answer.answer}</p>
                      <p className="text-xs text-muted-foreground">
                        {answer.source==='review+timeline' ? 'AIアドバイスに加えて必要な時系列記録も確認して回答' : '今日のAIアドバイスと集計データから回答'}
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <p className="text-xs text-muted-foreground">
                {new Date(review.generatedAt).toLocaleString("ja-JP")}作成。同じ日の生成結果は家族で共有します。医療上の診断ではありません。
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
