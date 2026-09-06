import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  BarChart3,
  BellRing,
  Check,
  Crown,
  Music2,
  PackageSearch,
  Palette,
  Sparkles,
  Users,
} from "lucide-react";
import { db } from "@/firebase";
import type { AiDraft, FamilyAccess } from "@/lib/ai";
import { callService } from "@/lib/ai";
import type { AppState } from "@/types";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

type AiToolsProps = {
  familyId: string;
  app: AppState;
  onSave: (events: AiDraft[]) => boolean;
  embedded?: boolean;
};

const premiumBenefits = [
  {
    icon: Sparkles,
    title: "AIアドバイス & AI質問",
    description:
      "直近2週間の記録をAIが読み解き、「最近の傾向」と「今日見るポイント」を整理。気になったことは、そのままAIに質問できます。",
  },
  {
    icon: BarChart3,
    title: "2人分のお世話ゲージ",
    description:
      "ミルク・おむつ・睡眠の“そろそろ”を、双子それぞれ一目で確認。忙しいときも、次に誰のお世話をするか迷いにくくなります。",
  },
  {
    icon: PackageSearch,
    title: "おむつ在庫切れ予測",
    description:
      "残り枚数と日々の使用ペースから、なくなる時期を自動予測。買い忘れて困る前に、必要なタイミングを知らせます。",
  },
  {
    icon: Users,
    title: "家族みんなで共有",
    description:
      "パパ・ママ・家族が同じ記録をリアルタイムで共有。『最後にミルクを飲んだのはいつ？』を毎回確認しなくても、Twinlyを見ればわかります。",
  },
  {
    icon: BellRing,
    title: "今日のまとめ通知",
    description:
      "1日のミルク量、睡眠時間、おしっこ・うんちを自動集計。指定した時刻に、家族の通知ON端末へその日のまとめを届けます。",
  },
  {
    icon: Palette,
    title: "Premium限定テーマ",
    description:
      "白・ピンク・イエローなど、気分や好みに合わせてTwinlyを着せ替え。毎日開くアプリだからこそ、見た目にもこだわれます。",
  },
  {
    icon: Music2,
    title: "選べるおやすみ音楽",
    description:
      "無料版のホワイトノイズに加えて、複数のおやすみ音源を利用可能。2人が眠ったあとは15分で自動停止します。",
  },
] as const;

const comparisonRows = [
  ["基本の育児記録", true, true],
  ["通常の音声入力", true, true],
  ["ホワイトノイズ", true, true],
  ["各種お世話ゲージ", false, true],
  ["AIアドバイス・AI質問", false, true],
  ["おむつ在庫切れ予測・通知", false, true],
  ["家族との記録共有", false, true],
  ["複数のおやすみ音楽", false, true],
  ["今日のまとめ通知", false, true],
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
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-background to-background p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Crown className="h-4 w-4" /> Twinly Premium
        </div>
        <h3 className="mt-3 text-xl font-bold leading-tight">2人分の育児を、もっと迷わず、もっとラクに。</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          記録するだけだったTwinlyが、次のお世話・最近の変化・買い足しまで先回りして支えます。
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

      <section className="min-w-0">
        <div className="mb-3">
          <h3 className="font-bold">Premiumでできること</h3>
          <p className="mt-1 text-xs text-muted-foreground">双子育児で本当に役立つ機能だけを、少しずつ増やしています。</p>
        </div>
        <div className="space-y-2">
          {premiumBenefits.map(({ icon: Icon, title, description }) => (
            <article key={title} className="min-w-0 rounded-xl border bg-card p-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold">{title}</h4>
                  <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5">
        <div className="text-sm font-bold text-primary">Twinlyをつくった理由</div>
        <h3 className="mt-2 text-lg font-bold leading-snug">双子育児をする私たち夫婦の、「こんなアプリが欲しかった」から始まりました。</h3>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            新生児期、2人分のミルク・おむつ・睡眠を追いながら、双子に特化していて、片手でも素早く記録できるアプリを探しました。でも、自分たちが本当に欲しいものは見つかりませんでした。
          </p>
          <p>
            そこで、自分たちでTwinlyを作りました。実際に毎日使いながら、「これが欲しい」「ここが面倒」をそのまま機能に変え、双子の成長と一緒にアップデートを重ねています。
          </p>
          <p>
            これからも夫婦で全力で2人を育てながら、Twinlyももっと頼れるアプリへ育てていきます。
          </p>
        </div>
        <div className="mt-4 rounded-xl bg-background/70 p-3 text-sm font-semibold leading-relaxed">
          Premiumは便利な追加機能を使えるだけでなく、Twinlyをこれからも改善し続けるための支えになります。気に入っていただけたら、応援していただけると嬉しいです。
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-xl border">
        <div className="grid grid-cols-[minmax(0,1fr)_56px_72px] border-b bg-muted/40 px-3 py-2 text-xs font-semibold">
          <span>機能</span><span className="text-center">Free</span><span className="text-center">Premium</span>
        </div>
        {comparisonRows.map(([label, free, paid]) => (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_56px_72px] items-center border-b px-3 py-2.5 text-xs last:border-b-0">
            <span className="min-w-0 break-words pr-2">{label}</span>
            <span className="text-center">{free ? <Check className="mx-auto h-4 w-4" /> : <span className="text-muted-foreground">—</span>}</span>
            <span className="text-center">{paid ? <Check className="mx-auto h-4 w-4 text-primary" /> : <span>—</span>}</span>
          </div>
        ))}
      </section>

      {!premium ? (
        <section className="rounded-2xl border bg-primary/5 p-4 text-center">
          <div className="text-sm font-bold">双子育児を、少しでもラクに。</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">まずは7日間、すべてのPremium機能を試してみてください。</p>
          <Button className="mt-4 w-full" size="lg" disabled={busy || !access?.canPreview} onClick={() => void changePreviewPlan("premium")}>
            7日間無料でPremiumを試す
          </Button>
        </section>
      ) : (
        <div className="rounded-xl border bg-primary/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4 text-primary" />Premium機能が利用できます</div>
          <p className="mt-1 text-xs text-muted-foreground">AIアドバイスはホームから、今日のまとめ通知は「通知」タブから設定できます。</p>
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>料金とプラン</DialogTitle>
            <DialogDescription>FreeとPremiumの違いを確認できます。</DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  );
}
