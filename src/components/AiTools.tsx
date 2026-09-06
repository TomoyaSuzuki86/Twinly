import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Check, Crown } from "lucide-react";
import { db } from "@/firebase";
import type { AiDraft, FamilyAccess } from "@/lib/ai";
import { callService } from "@/lib/ai";
import type { AppState } from "@/types";
import { PremiumFeatureShowcase } from "./PremiumFeatureShowcase";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

type AiToolsProps = {
  familyId: string;
  app: AppState;
  onSave: (events: AiDraft[]) => boolean;
  embedded?: boolean;
};

const comparisonRows = [
  ["基本の育児記録", true, true],
  ["通常の音声入力", true, true],
  ["ホワイトノイズ", true, true],
  ["各種お世話ゲージ", false, true],
  ["AIアドバイス・AI質問", false, true],
  ["おむつ在庫切れ予測・通知", false, true],
  ["家族との記録共有", false, true],
  ["複数のおやすみ音楽", false, true],
  ["今日のまとめメール", false, true],
  ["追加テーマ", false, true],
] as const;

export function AiTools({ familyId, embedded = false }: AiToolsProps) {
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<FamilyAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      callService<FamilyAccess>("getFamilyAccess")
        .then((value) => {
          if (active) {
            setAccess(value);
            setError("");
          }
        })
        .catch(() => {
          if (active) setError("プラン情報を取得できませんでした。");
        });
    };
    refresh();
    const unsubscribe = db
      ? onSnapshot(doc(db, "families", familyId, "services", "access"), refresh, () => {
          if (active) setError("プラン情報の同期に失敗しました。");
        })
      : () => {};
    return () => {
      active = false;
      unsubscribe();
    };
  }, [familyId]);

  const changePreviewPlan = async (plan: "free" | "premium") => {
    if (inFlight.current || !access?.canPreview) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await callService<FamilyAccess>("setFamilyPreviewPlan", { plan });
      if (mounted.current) setAccess(next);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "プランを切り替えられませんでした。");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const premium = access?.plan === "premium";

  const content = (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-background to-background p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Crown className="h-4 w-4" /> Twinly Premium
        </div>
        <h3 className="mt-3 text-xl font-bold leading-tight">双子育児の「次どうする？」を、少しでも減らす。</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          記録したデータを、AI・ゲージ・在庫予測・家族共有へ。2人分の育児を、もっと見通しよくします。
        </p>
        <div className="mt-5 flex items-end gap-2">
          <span className="text-3xl font-bold">¥500</span>
          <span className="pb-1 text-sm text-muted-foreground">/ 月</span>
        </div>
        <div className="mt-1 text-sm font-semibold text-primary">最初の7日間は無料</div>
        <Button
          className="mt-5 w-full"
          size="lg"
          disabled={busy || premium || !access?.canPreview}
          onClick={() => void changePreviewPlan("premium")}
        >
          {premium ? "Premiumを使用中" : busy ? "切り替え中…" : "7日間無料でPremiumを試す"}
        </Button>
        {!premium ? <p className="mt-2 text-center text-[11px] text-muted-foreground">いつでも無料版へ戻せます。</p> : null}
      </section>

      <PremiumFeatureShowcase />

      <section className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-[1fr_64px_82px] border-b bg-muted/40 px-3 py-2 text-xs font-semibold">
          <span>機能</span><span className="text-center">Free</span><span className="text-center">Premium</span>
        </div>
        {comparisonRows.map(([label, free, paid]) => (
          <div key={label} className="grid grid-cols-[1fr_64px_82px] items-center border-b px-3 py-2.5 text-xs last:border-b-0">
            <span>{label}</span>
            <span className="text-center">{free ? <Check className="mx-auto h-4 w-4" /> : <span className="text-muted-foreground">—</span>}</span>
            <span className="text-center">{paid ? <Check className="mx-auto h-4 w-4 text-primary" /> : <span>—</span>}</span>
          </div>
        ))}
      </section>

      {!premium ? (
        <section className="rounded-2xl border bg-primary/5 p-4 text-center">
          <div className="text-sm font-bold">Twinlyを、これからも育てていくために。</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">便利だと感じていただけたら、Premiumで応援していただけると嬉しいです。</p>
          <Button className="mt-4 w-full" size="lg" disabled={busy || !access?.canPreview} onClick={() => void changePreviewPlan("premium")}>
            7日間無料でPremiumを試す
          </Button>
        </section>
      ) : (
        <div className="rounded-xl border bg-primary/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4 text-primary" />Premium機能が利用できます</div>
          <p className="mt-1 text-xs text-muted-foreground">AIアドバイスはホームから、日次メールは「通知」タブから設定できます。</p>
        </div>
      )}

      {access?.canPreview ? (
        <div className="border-t pt-3 text-center">
          <p className="text-[11px] text-muted-foreground">現在は正式決済前の開発プレビューです。課金は発生しません。</p>
          {premium ? (
            <button type="button" className="mt-2 text-xs text-muted-foreground underline" disabled={busy} onClick={() => void changePreviewPlan("free")}>
              開発確認用：無料版表示に戻す
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="rounded-lg border p-3 text-sm">{error}</p> : null}
    </div>
  );

  if (embedded) return content;

  return (
    <>
      <Button variant="ghost" size="sm" className="px-2 text-xs" onClick={() => setOpen(true)}>料金とプラン</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>料金とプラン</DialogTitle>
            <DialogDescription>FreeとPremiumの違いを、実際の利用イメージと一緒に確認できます。</DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  );
}
