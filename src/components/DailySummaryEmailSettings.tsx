import { useEffect, useRef, useState } from "react";
import { BellRing, Crown, Mail } from "lucide-react";
import type { DailySummaryEmailSettings as EmailSettings, FamilyAccess } from "@/lib/ai";
import { callService } from "@/lib/ai";
import { Button } from "./ui/button";

const DEFAULT_SETTINGS: EmailSettings = {
  enabled: false,
  hourJst: 21,
  recipients: [],
  canEdit: false,
};

export function DailySummaryEmailSettings() {
  const [access, setAccess] = useState<FamilyAccess | null>(null);
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    Promise.all([
      callService<FamilyAccess>("getFamilyAccess"),
      callService<EmailSettings>("getDailySummaryEmailSettings"),
    ])
      .then(([nextAccess, nextSettings]) => {
        if (!mounted.current) return;
        setAccess(nextAccess);
        setSettings(nextSettings);
      })
      .catch(() => {
        if (mounted.current) setMessage("日次まとめメールの設定を取得できませんでした。");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const save = async () => {
    if (busy || !settings.canEdit) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await callService<EmailSettings>("setDailySummaryEmailSettings", {
        enabled: settings.enabled,
        hourJst: settings.hourJst,
      });
      if (mounted.current) {
        setSettings(next);
        setMessage("設定を保存しました。");
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : "設定を保存できませんでした。");
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const premium = Boolean(access?.features.dailySummaryEmail);

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label="今日のまとめメール設定">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <Mail className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">今日のまとめメール</h3>
            {!loading && !premium ? (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                <Crown className="h-3 w-3" /> Premium
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            毎日決まった時刻に、双子のミルク・睡眠・おしっこ・うんち・離乳食を家族へまとめて送ります。
          </p>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">設定を確認しています…</p> : null}

      {!loading && !premium ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold"><BellRing className="h-4 w-4" />Premiumで利用できます</div>
          <p className="mt-1 text-xs text-muted-foreground">料金とプランからPremiumを開始すると設定できるようになります。</p>
        </div>
      ) : null}

      {!loading && premium ? (
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-3 text-sm">
            <span>
              <span className="block font-semibold">毎日メールを送る</span>
              <span className="block text-xs text-muted-foreground">家族全員の登録メールアドレスへ送信します。</span>
            </span>
            <input
              aria-label="毎日メールを送る"
              type="checkbox"
              checked={settings.enabled}
              disabled={!settings.canEdit || busy}
              onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">送信時刻</span>
            <select
              aria-label="日次まとめメール送信時刻"
              className="rounded-md border bg-background px-3 py-2"
              value={settings.hourJst}
              disabled={!settings.canEdit || busy}
              onChange={(event) => setSettings((current) => ({ ...current, hourJst: Number(event.target.value) }))}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>
              ))}
            </select>
          </label>

          <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">送信先</div>
            <div className="mt-1 break-words">
              {settings.recipients.length ? settings.recipients.join(" / ") : "メールアドレスが登録された家族メンバーがいません"}
            </div>
          </div>

          <Button onClick={() => void save()} disabled={!settings.canEdit || busy}>
            {busy ? "保存中…" : "メール設定を保存"}
          </Button>
          {!settings.canEdit ? <p className="text-xs text-muted-foreground">この設定は家族のオーナーのみ変更できます。</p> : null}
        </div>
      ) : null}

      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
