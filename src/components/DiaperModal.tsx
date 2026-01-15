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
import { DiaperKind, BabyProfile } from "@/types";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Selectコンポーネントをインポート

type DiaperModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  onSave: (payload: { diaperKind: DiaperKind; note: string; selectedDiaperSize: string }) => void;
  // 新しく追加するプロパティ
  diaperStockBySize: Record<string, number>;
  onUpdateDiaperStock: (size: string, stock: number) => void;
  babyProfile: BabyProfile; // Add babyProfile prop
};

const diaperKindOptions = [
  { k: "pee", label: "おしっこ" },
  { k: "poop", label: "うんち" },
  { k: "mix", label: "両方" },
] as const;

const stoolConsistencyOptions = [
  { value: "ふつう", label: "ふつう" },
  { value: "やわらかめ", label: "やわらかめ" },
  { value: "かため", label: "かため" },
];

export function DiaperModal({
  open,
  onOpenChange,
  displayName,
  onSave,
  diaperStockBySize,
  onUpdateDiaperStock,
  babyProfile, // Destructure babyProfile
}: DiaperModalProps) {
  const [diaperKind, setDiaperKind] = useState<DiaperKind>("pee");
  const [note, setNote] = useState("");
  const [stoolConsistency, setStoolConsistency] = useState("ふつう"); // New state for stool consistency
  const [selectedDiaperSize, setSelectedDiaperSize] = useState<string>("");
  const [currentDiaperStock, setCurrentDiaperStock] = useState<number>(0);

  useEffect(() => {
    if (open) {
      setDiaperKind("pee");
      setNote("");
      setStoolConsistency("ふつう"); // Reset stool consistency
      // モーダルが開いたときに、babyProfile.diaperSize を初期値として設定
      setSelectedDiaperSize(babyProfile.diaperSize);
      setCurrentDiaperStock(diaperStockBySize[babyProfile.diaperSize] || 0);
    }
  }, [open, diaperStockBySize, babyProfile]); // Add babyProfile to dependencies

  // 選択されたおむつサイズが変わったときに在庫数を更新
  useEffect(() => {
    if (selectedDiaperSize) {
      setCurrentDiaperStock(diaperStockBySize[selectedDiaperSize] || 0);
    }
  }, [selectedDiaperSize, diaperStockBySize]);

  const handleSave = () => {
    let finalNote = note;
    if (diaperKind === "poop" || diaperKind === "mix") {
      finalNote = `${note}${note ? "_" : ""}状態：${stoolConsistency}`;
    }
    onSave({ diaperKind, note: finalNote, selectedDiaperSize });
    onOpenChange(false);
  };

  const handleStockChange = (amount: number) => {
    setCurrentDiaperStock((prev) => Math.max(0, prev + amount));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{displayName}: おむつ記録</DialogTitle>
        </DialogHeader>
        <div className="space-y-8 py-4">
          {/* 既存のおむつ種類選択 */}
          <div>
            <Label className="text-sm font-semibold text-muted-foreground">種類</Label>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {diaperKindOptions.map((x) => (
                <Button
                  key={x.k}
                  variant={diaperKind === x.k ? "default" : "outline"}
                  className="py-6 text-base"
                  onClick={() => setDiaperKind(x.k)}
                >
                  {x.label}
                </Button>
              ))}
            </div>
          </div>

          {/* おむつ在庫管理セクション */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-muted-foreground">おむつ在庫</Label>
            <div className="flex flex-col gap-4 mt-2">
              {/* Diaper Size Selection */}
              <div className="flex items-center gap-2">
                <Label htmlFor="diaper-size-select" className="w-24">サイズ:</Label>
                <Select
                  value={selectedDiaperSize}
                  onValueChange={(value) => setSelectedDiaperSize(value)}
                >
                  <SelectTrigger id="diaper-size-select" className="flex-grow">
                    <SelectValue placeholder="サイズを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(diaperStockBySize).map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stock Adjustment */}
              <div className="flex items-center gap-2">
                <Label htmlFor="diaper-stock-input" className="w-24">在庫数:</Label>
                <Button variant="outline" size="icon" onClick={() => handleStockChange(-10)} className="h-9 w-9">
                  -10
                </Button>
                <Button variant="outline" size="icon" onClick={() => handleStockChange(-1)} className="h-9 w-9">
                  -1
                </Button>
                <Input
                  id="diaper-stock-input"
                  type="number"
                  value={currentDiaperStock}
                  onChange={(e) => setCurrentDiaperStock(Number(e.target.value))}
                  className="w-20 text-center text-base"
                />
                <Button variant="outline" size="icon" onClick={() => handleStockChange(1)} className="h-9 w-9">
                  +1
                </Button>
                <Button variant="outline" size="icon" onClick={() => handleStockChange(10)} className="h-9 w-9">
                  +10
                </Button>
              </div>
            </div>
          </div>

          {/* 既存のメモ入力 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">メモ（任意）</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：肌荒れ気味"
            />
          </div>

          {/* うんちの状態選択 (poop または mix の場合のみ表示) */}
          {(diaperKind === "poop" || diaperKind === "mix") && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-muted-foreground">うんちの状態</Label>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {stoolConsistencyOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={stoolConsistency === option.value ? "default" : "outline"}
                    className="py-6 text-base"
                    onClick={() => setStoolConsistency(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">キャンセル</Button>
          </DialogClose>
          <Button onClick={handleSave} className="bg-amber-600 hover:bg-amber-500">
            保存する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
