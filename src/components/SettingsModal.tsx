import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppState, BabyId } from "@/types";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { User } from "firebase/auth";
import React from "react";

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: AppState;
  setApp: React.Dispatch<React.SetStateAction<AppState>>;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetAll: () => void;
  googleToken: string;
};

const iconGradients = [
  { label: "Violet", value: "from-violet-500 to-fuchsia-500" },
  { label: "Sky", value: "from-sky-500 to-cyan-400" },
  { label: "Amber", value: "from-amber-500 to-orange-400" },
  { label: "Emerald", value: "from-emerald-500 to-teal-400" },
  { label: "Rose", value: "from-rose-500 to-pink-400" },
];

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
}: SettingsModalProps) {
  const importRef = React.useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="profile" className="py-4">
          <TabsList>
            <TabsTrigger value="profile">プロフィール</TabsTrigger>
            <TabsTrigger value="calendar">カレンダー連携</TabsTrigger>
            <TabsTrigger value="cloud">クラウド同期</TabsTrigger>
            <TabsTrigger value="data">データ管理</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-4">
            <div className="grid gap-6 sm:grid-cols-2">
              {(Object.keys(app.profiles) as BabyId[]).map((babyId) => {
                const p = app.profiles[babyId];
                return (
                  <div key={babyId} className="space-y-4 rounded-lg border p-4">
                    <h3 className="font-semibold">赤ちゃん {babyId}</h3>
                    <div className="space-y-2">
                      <Label>表示名</Label>
                      <Input
                        value={p.displayName}
                        onChange={(e) =>
                          setApp((prev) => ({
                            ...prev,
                            profiles: {
                              ...prev.profiles,
                              [babyId]: { ...p, displayName: e.target.value },
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>アイコン（絵文字）</Label>
                      <Input
                        maxLength={2}
                        value={p.iconEmoji ?? ""}
                        onChange={(e) =>
                          setApp((prev) => ({
                            ...prev,
                            profiles: {
                              ...prev.profiles,
                              [babyId]: { ...p, iconEmoji: e.target.value },
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>アイコンカラー</Label>
                      {/* TODO: Replace with Select component */}
                      <select
                        className="w-full rounded-md border bg-background p-2"
                        value={p.iconGradient ?? ""}
                        onChange={(e) =>
                          setApp((prev) => ({
                            ...prev,
                            profiles: {
                              ...prev.profiles,
                              [babyId]: { ...p, iconGradient: e.target.value },
                            },
                          }))
                        }
                      >
                        {iconGradients.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>カレンダー名</Label>
                      <Input
                        value={p.calendarName}
                        onChange={(e) =>
                          setApp((prev) => ({
                            ...prev,
                            profiles: {
                              ...prev.profiles,
                              [babyId]: {
                                ...p,
                                calendarName: e.target.value,
                                calendarId: "", // Reset calendar ID when name changes
                              },
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>生年月日</Label>
                      <Input
                        type="date"
                        value={p.birthDate}
                        onChange={(e) =>
                          setApp((prev) => ({
                            ...prev,
                            profiles: {
                              ...prev.profiles,
                              [babyId]: { ...p, birthDate: e.target.value },
                            },
                          }))
                        }
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
        </Tabs>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">閉じる</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
