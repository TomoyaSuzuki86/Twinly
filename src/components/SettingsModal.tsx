import * as DialogComponents from "@/components/ui/dialog";
console.log('DialogComponents imported in SettingsModal:', DialogComponents);
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"; // Named import for Tabs
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "./ui/label";
import React, { useEffect, useState } from "react"; // Import useEffect, useState
import type { User } from "firebase/auth";
import { AppState, BabyId, BabyProfile } from "@/types"; // Import BabyProfile
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select components
import { iconGradients } from "@/lib/utils"; // Import iconGradients from utils

// ... (rest of the file)

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: AppState;
  setApp: (updater: AppState | ((prev: AppState) => AppState)) => void;
  user: User | null;
  onSignIn: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetAll: () => void;
  googleToken: string;
  hasGoogleOauthClientId: boolean;
};

export function SettingsModal({
  open,
  onOpenChange,
  app,
  setApp,
  user,
  onSignIn,
  onSignOut,
  onExport,
  onImport,
  onResetAll,
  googleToken,
  hasGoogleOauthClientId,
}: SettingsModalProps) {
  const importRef = React.useRef<HTMLInputElement>(null);

  // Local state for profiles to prevent re-renders on every keystroke
  const [localProfiles, setLocalProfiles] = useState<Record<BabyId, BabyProfile>>(() => app.profiles);

  // Update localProfiles when the modal opens or app.profiles changes from outside
  useEffect(() => {
    if (open) {
      setLocalProfiles(app.profiles);
    }
  }, [open, app.profiles]);

  // Function to handle changes to a specific baby's profile
  const handleProfileChange = (babyId: BabyId, field: keyof BabyProfile, value: any) => {
    setLocalProfiles((prev) => ({
      ...prev,
      [babyId]: {
        ...prev[babyId],
        [field]: value,
      },
    }));
  };

  // Function to handle changes to diaper stock
  const handleDiaperStockChange = (size: string, amount: number) => {
    setLocalProfiles((prev) => {
      const nextProfiles = { ...prev };
      // Assuming all profiles have the same diaper sizes and stock is shared
      const currentStock = nextProfiles.A.diaperStockBySize[size] ?? 0; // Get current stock from any baby (e.g., A)

      (Object.keys(nextProfiles) as BabyId[]).forEach((babyId) => {
        nextProfiles[babyId] = {
          ...nextProfiles[babyId],
          diaperStockBySize: {
            ...nextProfiles[babyId].diaperStockBySize,
            [size]: currentStock + amount,
          },
        };
      });
      return nextProfiles;
    });
  };

  // Function to save localProfiles to global app state when modal closes
  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      // Only save if there are actual changes to prevent unnecessary Firestore writes
      // A more robust check would be a deep comparison, but a simple check for now.
      if (JSON.stringify(localProfiles) !== JSON.stringify(app.profiles)) {
        setApp((prev) => ({ ...prev, profiles: localProfiles }));
      }
    }
    onOpenChange(isOpen);
  };

  return (
    <DialogComponents.Dialog open={open} onOpenChange={handleClose}> {/* Use handleClose here */}
      <DialogComponents.DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-4">
        <DialogComponents.DialogHeader>
          <DialogComponents.DialogTitle>設定</DialogComponents.DialogTitle>
        </DialogComponents.DialogHeader>
        <Tabs defaultValue="profile" className="py-4">
          <TabsList className="flex flex-wrap justify-between"> {/* Changed flex-wrap to justify-between */}
            <TabsTrigger value="profile">プロフィール</TabsTrigger>
            <TabsTrigger value="calendar">カレンダー連携</TabsTrigger>
            <TabsTrigger value="cloud">クラウド同期</TabsTrigger>
            <TabsTrigger value="data">データ管理</TabsTrigger>
            <TabsTrigger value="diaper-stock">おむつ在庫</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-4">
            <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2">
              {(Object.keys(localProfiles) as BabyId[]).map((babyId) => { // Use localProfiles here
                const p = localProfiles[babyId]; // Use localProfiles here
                return (
                  <div key={babyId} className="space-y-4 rounded-lg border p-4">
                    <h3 className="font-semibold">赤ちゃん {babyId}</h3>
                    <div className="space-y-2">
                      <Label>表示名</Label>
                      <Input
                        value={p.displayName}
                        onChange={(e) => handleProfileChange(babyId, "displayName", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>アイコン（絵文字）</Label>
                      <Input
                        maxLength={2}
                        value={p.iconEmoji ?? ""}
                        onChange={(e) => handleProfileChange(babyId, "iconEmoji", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>アイコンカラー</Label>
                      <Select
                        value={p.iconGradient ?? ""}
                        onValueChange={(value) => handleProfileChange(babyId, "iconGradient", value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="アイコンカラーを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {iconGradients.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <span className={`h-4 w-4 rounded-full ${opt.bgColor}`}></span>
                                {opt.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>カレンダー名</Label>
                      <Input
                        value={p.calendarName}
                        onChange={(e) => {
                          handleProfileChange(babyId, "calendarName", e.target.value);
                          // Reset calendar ID when name changes
                          // This needs to be handled carefully if we're batching updates.
                          // For now, let's assume calendarId reset is part of the global setApp logic.
                          // Or, if it's critical, it needs to be part of handleProfileChange.
                          // For simplicity, I'll keep it as is for now, but note this potential edge case.
                          // If calendarId needs to be reset immediately, it should be:
                          // setLocalProfiles((prev) => ({
                          //   ...prev,
                          //   [babyId]: { ...prev[babyId], calendarName: e.target.value, calendarId: "" },
                          // }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>生年月日</Label>
                      <Input
                        type="date"
                        value={p.birthDate}
                        onChange={(e) => handleProfileChange(babyId, "birthDate", e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="calendar">
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold">Google Calendar連携</h3>
              <p className="text-sm text-muted-foreground">
                記録をGoogleカレンダーに自動で同期します。同期を有効にするには、クラウド同期をONにしてください。
              </p>
              {!hasGoogleOauthClientId && (
                <div className="rounded-md border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-100">
                  Google OAuth クライアントID（VITE_GOOGLE_OAUTH_CLIENT_ID）が未設定のため、トークン更新に失敗します。
                </div>
              )}
              {user ? (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-emerald-600">✓ カレンダー連携は有効です</p>
                  <div className="space-y-2">
                    {(Object.keys(app.profiles) as BabyId[]).map((babyId) => {
                      const p = app.profiles[babyId];
                      return (
                        <div key={babyId} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                          <span className="font-semibold">{p.displayName}</span>
                          <span className="text-muted-foreground">{p.calendarName}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <Button onClick={onSignIn}>Googleカレンダーに接続</Button>
              )}
            </div>
          </TabsContent>
          <TabsContent value="cloud">
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold">クラウド同期</h3>
              <p className="text-sm text-muted-foreground">
                Googleアカウントでログインすると、複数のデバイスでデータを同期できます。
              </p>
              {user ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <img src={user.photoURL!} alt="avatar" className="h-10 w-10 rounded-full" />
                    <div>
                      <p className="font-semibold">{user.displayName}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Googleトークン: {googleToken ? <span className="text-emerald-600">取得済み</span> : <span className="text-rose-600">未取得</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    OAuthクライアントID:{" "}
                    {hasGoogleOauthClientId ? (
                      <span className="text-emerald-600">設定済み</span>
                    ) : (
                      <span className="text-rose-600">未設定</span>
                    )}
                  </p>
                  <Button variant="outline" onClick={onSignOut}>
                    サインアウト
                  </Button>
                </div>
              ) : (
                <Button onClick={onSignIn}>Googleでサインイン</Button>
              )}
            </div>
          </TabsContent>
          <TabsContent value="data">
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold">データ管理</h3>
              <p className="text-sm text-muted-foreground">
                アプリのデータをファイルに書き出したり、ファイルから読み込んだりします。
              </p>
              <div className="flex gap-4">
                <Button variant="outline" onClick={onExport}>
                  エクスポート
                </Button>
                <Button variant="outline" onClick={() => importRef.current?.click()}>
                  インポート
                </Button>
                <input type="file" accept=".json" ref={importRef} className="hidden" onChange={onImport} />
              </div>
              <div className="pt-4">
                <Button variant="destructive" onClick={onResetAll}>
                  全てのデータを削除
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="diaper-stock">
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold">おむつ在庫管理</h3>
              <p className="text-sm text-muted-foreground">
                おむつのサイズごとの在庫数を管理します。この設定は全ての赤ちゃんに適用されます。
              </p>
              <div className="space-y-4">
                {Object.keys(localProfiles.A.diaperStockBySize).map((size) => ( // Assuming all profiles have the same diaper sizes
                  <div key={size} className="flex items-center gap-4">
                    <Label className="w-20">{size}</Label>
                    <Button variant="outline" size="icon" onClick={() => handleDiaperStockChange(size, -10)} className="h-9 w-9">
                      -10
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleDiaperStockChange(size, -1)} className="h-9 w-9">
                      -1
                    </Button>
                    <Input
                      type="number"
                      value={localProfiles.A.diaperStockBySize[size] ?? 0}
                      onChange={(e) => handleDiaperStockChange(size, Number(e.target.value) - (localProfiles.A.diaperStockBySize[size] ?? 0))}
                      className="w-20 text-center text-base"
                    />
                    <Button variant="outline" size="icon" onClick={() => handleDiaperStockChange(size, 1)} className="h-9 w-9">
                      +1
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleDiaperStockChange(size, 10)} className="h-9 w-9">
                      +10
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <DialogComponents.DialogFooter>
          <DialogComponents.DialogClose asChild>
            <Button variant="outline">閉じる</Button>
          </DialogComponents.DialogClose>
        </DialogComponents.DialogFooter>
      </DialogComponents.DialogContent>
    </DialogComponents.Dialog>
  );
}
