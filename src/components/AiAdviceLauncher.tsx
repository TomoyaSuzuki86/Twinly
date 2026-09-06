import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { AiReview, FamilyAccess, callService } from "@/lib/ai";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

const TARGET_SELECTOR = 'button[aria-label="週間タイムラインを開く"]';
const CONSENT_KEY = "twinly-ai-review-consent-v2";
const JST = 9 * 60 * 60 * 1000;
const dayKey = (timestamp = Date.now()) => new Date(timestamp + JST).toISOString().slice(0, 10);

export function AiAdviceLauncher() {
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const targetMap = useRef(new Map<HTMLButtonElement, HTMLSpanElement>());
  const [access, setAccess] = useState<FamilyAccess | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<AiReview | null>(null);
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
      setTargets(Array.from(targetMap.current.values()));
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
      if (review && dayKey(review.generatedAt) !== dayKey()) setReview(null);
    }, 60000);
    return () => window.clearInterval(interval);
  }, [review]);

  const loadReview = async () => {
    if (inFlight.current) return;
    if (review && dayKey(review.generatedAt) === dayKey()) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await callService<AiReview>("twinlyAi", { mode: "review" });
      setReview(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AIアドバイスを取得できませんでした");
    } finally {
      inFlight.current = false;
      setBusy(false);
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
                  AIアドバイス生成時、GoogleのAPIへ赤ちゃんの登録名、生年月日、直近2週間のミルク・おむつ・離乳食・睡眠・体重の集計、メモを送信することに同意します。
                </span>
              </label>
              <Button disabled={!consentChecked || busy} onClick={acceptAndLoad}>同意してアドバイスを見る</Button>
            </div>
          ) : null}

          {consent && !review && !busy ? (
            <Button onClick={() => void loadReview()}>AIアドバイスを生成・表示</Button>
          ) : null}

          {busy ? <p role="status" className="text-sm text-muted-foreground">直近2週間を確認しています…</p> : null}
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
