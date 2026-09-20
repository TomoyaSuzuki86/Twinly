import { Button } from "./ui/button";
import { DailySummaryEmailSettings } from "./DailySummaryEmailSettings";

export const shouldDisablePushEnable = (
  pushBusy: boolean,
  pushSubscribed: boolean,
  webPushConfigured: boolean
) => pushBusy || pushSubscribed || !webPushConfigured;

export function SettingsNotificationsTab({
  signedIn,
  webPushConfigured,
  pushPermission,
  pushSubscribed,
  pushBusy,
  onEnablePushNotifications,
  onDisablePushNotifications,
  onSignIn,
}: {
  signedIn: boolean;
  webPushConfigured: boolean;
  pushPermission: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
  pushBusy: boolean;
  onEnablePushNotifications: () => void | Promise<void>;
  onDisablePushNotifications: () => void | Promise<void>;
  onSignIn: () => void | Promise<void>;
}) {
  return (
    <>
      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="font-semibold">プッシュ通知</h3>
          <p className="mt-1 text-sm text-muted-foreground">この端末への育児リマインド通知を管理します。</p>
        </div>
        {signedIn ? (
          !webPushConfigured ? (
            <p className="text-sm text-muted-foreground">
              通知用の公開鍵が未設定のため、この端末ではまだ通知を有効化できません。
            </p>
          ) : pushPermission === "unsupported" ? (
            <p className="text-sm text-muted-foreground">
              この端末・ブラウザでは PWA のプッシュ通知に対応していません。
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                ミルク・おむつのゲージが満タンになる頃に通知します。通知時刻が15分以内ならまとめて1通にします。
              </p>
              <p className="text-sm text-muted-foreground">
                状態:{" "}
                {pushSubscribed && pushPermission === "granted"
                  ? "有効"
                  : pushPermission === "denied"
                    ? "ブラウザで拒否されています"
                    : "未設定"}
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={onEnablePushNotifications}
                  disabled={shouldDisablePushEnable(pushBusy, pushSubscribed, webPushConfigured)}
                >
                  通知を有効化
                </Button>
                <Button
                  variant="outline"
                  onClick={onDisablePushNotifications}
                  disabled={pushBusy || !pushSubscribed}
                >
                  通知を解除
                </Button>
              </div>
            </>
          )
        ) : (
          <Button onClick={onSignIn}>ログイン画面を開く</Button>
        )}
      </div>
      {signedIn ? <DailySummaryEmailSettings /> : null}
    </>
  );
}
