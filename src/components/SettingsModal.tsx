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

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: AppState;
  setApp: React.Dispatch<React.SetStateAction<AppState>>;
  // TODO: Add more props for auth, cloud, etc.
};

const iconGradients = [
  { label: "Violet", value: "from-violet-500 to-fuchsia-500" },
  { label: "Sky", value: "from-sky-500 to-cyan-400" },
  { label: "Amber", value: "from-amber-500 to-orange-400" },
  { label: "Emerald", value: "from-emerald-500 to-teal-400" },
  { label: "Rose", value: "from-rose-500 to-pink-400" },
];

export function SettingsModal({ open, onOpenChange, app, setApp }: SettingsModalProps) {
  // This is a simplified version.
  // A full implementation would require passing down many more state and handler props.

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
            <p className="text-muted-foreground">カレンダー連携の設定はここに表示されます。</p>
          </TabsContent>
          <TabsContent value="cloud">
            <p className="text-muted-foreground">クラウド同期の設定はここに表示されます。</p>
          </TabsContent>
          <TabsContent value="data">
            <p className="text-muted-foreground">データ管理（インポート/エクスポート）はここに表示されます。</p>
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
