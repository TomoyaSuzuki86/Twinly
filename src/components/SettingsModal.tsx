import * as DialogComponents from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "./ui/label";
import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { AppState, BabyId, BabyProfile } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { iconGradients } from "@/lib/utils";

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
}: SettingsModalProps) {
  const importRef = React.useRef<HTMLInputElement>(null);
  const [localProfiles, setLocalProfiles] = useState<Record<BabyId, BabyProfile>>(() => app.profiles);

  useEffect(() => {
    if (open) {
      setLocalProfiles(app.profiles);
    }
  }, [open, app.profiles]);

  const handleProfileChange = <K extends keyof BabyProfile>(babyId: BabyId, field: K, value: BabyProfile[K]) => {
    setLocalProfiles((prev) => ({
      ...prev,
      [babyId]: {
        ...prev[babyId],
        [field]: value,
      },
    }));
  };

  const handleDiaperStockChange = (size: string, amount: number) => {
    setLocalProfiles((prev) => {
      const nextProfiles = { ...prev };
      const currentStock = nextProfiles.A.diaperStockBySize[size] ?? 0;
      const nextStock = currentStock + amount;

      (Object.keys(nextProfiles) as BabyId[]).forEach((babyId) => {
        nextProfiles[babyId] = {
          ...nextProfiles[babyId],
          diaperStockBySize: {
            ...nextProfiles[babyId].diaperStockBySize,
            [size]: nextStock,
          },
        };
      });

      return nextProfiles;
    });
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen && JSON.stringify(localProfiles) !== JSON.stringify(app.profiles)) {
      setApp((prev) => ({ ...prev, profiles: localProfiles }));
    }
    onOpenChange(isOpen);
  };

  return (
    <DialogComponents.Dialog open={open} onOpenChange={handleClose}>
      <DialogComponents.DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:max-w-md">
        <DialogComponents.DialogHeader>
          <DialogComponents.DialogTitle>設定</DialogComponents.DialogTitle>
          <DialogComponents.DialogDescription>
            赤ちゃん情報、共有設定、データ管理をここでまとめて変更できます。
          </DialogComponents.DialogDescription>
        </DialogComponents.DialogHeader>
        <Tabs defaultValue="profile" className="py-4">
          <TabsList className="flex flex-wrap justify-between">
            <TabsTrigger value="profile">プロフィール</TabsTrigger>
            <TabsTrigger value="cloud">クラウド共有</TabsTrigger>
            <TabsTrigger value="data">データ管理</TabsTrigger>
            <TabsTrigger value="diaper-stock">おむつ在庫</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-4">
            <div className="grid gap-6 md:grid-cols-2">
              {(Object.keys(localProfiles) as BabyId[]).map((babyId) => {
                const profile = localProfiles[babyId];
                return (
                  <div key={babyId} className="space-y-4 rounded-lg border p-4">
                    <h3 className="font-semibold">赤ちゃん {babyId}</h3>
                    <div className="space-y-2">
                      <Label>表示名</Label>
                      <Input
                        value={profile.displayName}
                        onChange={(e) => handleProfileChange(babyId, "displayName", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>アイコン文字</Label>
                      <Input
                        maxLength={2}
                        value={profile.iconEmoji ?? ""}
                        onChange={(e) => handleProfileChange(babyId, "iconEmoji", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>アイコンカラー</Label>
                      <Select
                        value={profile.iconGradient ?? ""}
                        onValueChange={(value) => handleProfileChange(babyId, "iconGradient", value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="アイコンカラーを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {iconGradients.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <span className={`h-4 w-4 rounded-full ${option.bgColor}`} />
                                {option.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>生年月日</Label>
                      <Input
                        type="date"
                        value={profile.birthDate}
                        onChange={(e) => handleProfileChange(babyId, "birthDate", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>おむつ購入リンク</Label>
                      <Input
                        value={profile.diaperPurchaseUrl ?? ""}
                        onChange={(e) => handleProfileChange(babyId, "diaperPurchaseUrl", e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="cloud">
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold">クラウド共有</h3>
              <p className="text-sm text-muted-foreground">
                Googleアカウントでログインすると、別端末でも同じ記録を見られます。
              </p>
              {user ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    {user.photoURL ? <img src={user.photoURL} alt="avatar" className="h-10 w-10 rounded-full" /> : null}
                    <div>
                      <p className="font-semibold">{user.displayName}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
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
                端末のデータをJSONで書き出したり、バックアップから復元できます。
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
                  すべてのデータを削除
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="diaper-stock">
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold">おむつ在庫</h3>
              <p className="text-sm text-muted-foreground">
                サイズごとの在庫を調整します。この設定は両方の赤ちゃんで共有されます。
              </p>
              <div className="space-y-4">
                {Object.keys(localProfiles.A.diaperStockBySize).map((size) => (
                  <div key={size} className="flex items-center gap-4">
                    <Label className="w-20">{size}</Label>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDiaperStockChange(size, -10)}
                      className="h-9 w-9"
                    >
                      -10
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDiaperStockChange(size, -1)}
                      className="h-9 w-9"
                    >
                      -1
                    </Button>
                    <Input
                      type="number"
                      value={localProfiles.A.diaperStockBySize[size] ?? 0}
                      onChange={(e) =>
                        handleDiaperStockChange(
                          size,
                          Number(e.target.value) - (localProfiles.A.diaperStockBySize[size] ?? 0)
                        )
                      }
                      className="w-20 text-center text-base"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDiaperStockChange(size, 1)}
                      className="h-9 w-9"
                    >
                      +1
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDiaperStockChange(size, 10)}
                      className="h-9 w-9"
                    >
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
