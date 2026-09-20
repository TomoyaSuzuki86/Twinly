import { useRef, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import type { BabyId, BabyProfile } from "@/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function SettingsDataTab({
  profiles,
  sleepManagementEnabled,
  setSleepManagementEnabled,
  diaperStockManagementEnabled,
  setDiaperStockManagementEnabled,
  onDiaperStockChange,
  onExport,
  onImport,
  onResetAll,
}: {
  profiles: Record<BabyId, BabyProfile>;
  sleepManagementEnabled: boolean;
  setSleepManagementEnabled: Dispatch<SetStateAction<boolean>>;
  diaperStockManagementEnabled: boolean;
  setDiaperStockManagementEnabled: Dispatch<SetStateAction<boolean>>;
  onDiaperStockChange: (size: string, amount: number) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onResetAll: () => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="font-semibold">記録機能</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            ホーム画面で使う記録機能と在庫管理を切り替えます。
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-3">
          <div>
            <div className="text-sm font-semibold">睡眠管理</div>
            <div className="text-xs text-muted-foreground">
              オフにするとホーム画面の睡眠記録ボタンを隠します。
            </div>
          </div>
          <Button
            aria-label="睡眠管理を切り替え"
            variant={sleepManagementEnabled ? "default" : "outline"}
            onClick={() => setSleepManagementEnabled((enabled) => !enabled)}
          >
            {sleepManagementEnabled ? "オン" : "オフ"}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-3">
          <div>
            <div className="text-sm font-semibold">おむつ在庫管理</div>
            <div className="text-xs text-muted-foreground">
              オフにすると在庫数・サイズ・購入リンクの入力を隠します。
            </div>
          </div>
          <Button
            aria-label="おむつ在庫管理を切り替え"
            variant={diaperStockManagementEnabled ? "default" : "outline"}
            onClick={() => setDiaperStockManagementEnabled((enabled) => !enabled)}
          >
            {diaperStockManagementEnabled ? "オン" : "オフ"}
          </Button>
        </div>
        {diaperStockManagementEnabled ? (
          <div className="space-y-4 rounded-lg border bg-background/30 p-3">
            <div>
              <h4 className="text-sm font-semibold">おむつ在庫</h4>
              <p className="text-xs text-muted-foreground">サイズごとの在庫は2人で共有されます。</p>
            </div>
            {Object.keys(profiles.A.diaperStockBySize).map((size) => {
              const current = profiles.A.diaperStockBySize[size] ?? 0;
              return (
                <div key={size} className="flex items-center gap-2 sm:gap-3">
                  <Label className="w-16 flex-shrink-0">{size}</Label>
                  <Button variant="outline" size="icon" onClick={() => onDiaperStockChange(size, -10)} className="h-9 w-9">-10</Button>
                  <Button variant="outline" size="icon" onClick={() => onDiaperStockChange(size, -1)} className="h-9 w-9">-1</Button>
                  <Input
                    aria-label={`${size}のおむつ在庫`}
                    type="number"
                    value={current}
                    onChange={(event) => onDiaperStockChange(size, Number(event.target.value) - current)}
                    className="min-w-0 flex-1 text-center text-base"
                  />
                  <Button variant="outline" size="icon" onClick={() => onDiaperStockChange(size, 1)} className="h-9 w-9">+1</Button>
                  <Button variant="outline" size="icon" onClick={() => onDiaperStockChange(size, 10)} className="h-9 w-9">+10</Button>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="font-semibold">バックアップ</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            現在のデータを JSON で書き出したり、バックアップから復元できます。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={onExport}>エクスポート</Button>
          <Button variant="outline" onClick={() => importRef.current?.click()}>インポート</Button>
          <input type="file" accept=".json" ref={importRef} className="hidden" onChange={onImport} />
        </div>
      </section>
      <section className="space-y-3 rounded-lg border border-destructive/30 p-4">
        <h3 className="font-semibold">データ削除</h3>
        <p className="text-sm text-muted-foreground">Twinlyの記録をすべて初期化します。</p>
        <Button variant="destructive" onClick={onResetAll}>すべてのデータを削除</Button>
      </section>
    </>
  );
}
