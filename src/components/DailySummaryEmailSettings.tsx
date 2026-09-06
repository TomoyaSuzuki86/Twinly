import { useEffect, useRef, useState } from "react";
import { AlertCircle, BellRing, CheckCircle2, Crown, Mail } from "lucide-react";
import type {
  DailySummaryEmailDeliveryStatus as DeliveryStatus,
  DailySummaryEmailSettings as EmailSettings,
  FamilyAccess,
} from "@/lib/ai";
import { callService } from "@/lib/ai";
import { Button } from "./ui/button";

const DEFAULT_SETTINGS: EmailSettings = {
  enabled: false,
  hourJst: 21,
  recipients: [],
  canEdit: false,
};

const formatSentAt = (timestamp: number) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(timestamp));

export function DailySummaryEmailSettings() {
  const [access, setAccess] = useState<FamilyAccess | null>(null);
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_SETTINGS);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus | null>(null);
  const [deliveryConfigured, setDeliveryConfigured] = useState<boolean | null>(null);
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

    callService<DeliveryStatus>("getDailySummaryDeliveryStatus")
      .then((status) => {
        if (!mounted.current) return;
        setDeliveryConfigured(true);
        setDeliveryStatus(status);
      })
      .catch((error: unknown) => {
        if (!mounted.current) return;
        const code = String((error as { code?: unknown } | null)?.code || "");
        if (code.includes("not-found") || code.includes("unimplemented")) {
          setDeliveryConfigured(false);
        }
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

          {deliveryConfigured === false ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs" role="status">
              <div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" />メール配送は準備中です</div>
              <p className="mt-1 text-muted-foreground">設定は保存できますが、運営側のメール配送設定が完了するまで実際のメールは送信されません。</p>
            </div>
          ) : null}

          {deliveryConfigured === true && deliveryStatus?.lastDeliveryError ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs" role="status">
              <div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" />直近のメール送信に失敗しました</div>
              <p className="mt-1 text-muted-foreground">Twinlyが自動で再試行します。しばらくしても届かない場合は、送信先メールアドレスを確認してください。</p>
            </div>
          ) : null}

          {deliveryConfigured === true && !deliveryStatus?.lastDeliveryError ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs" role="status">
              <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-primary" />メール配送の準備は完了しています</div>
              {deliveryStatus?.lastSentAt ? (
                <p className="mt-1 text-muted-foreground">最終送信：{formatSentAt(deliveryStatus.lastSentAt)}</p>
              ) : (
                <p className="mt-1 text-muted-foreground">次回の設定時刻から送信します。</p>
              )}
            </div>
          ) : null}

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
