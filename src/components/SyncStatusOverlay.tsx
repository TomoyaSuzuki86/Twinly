import type { SyncConflict } from "@/data/app-repository";
import type { StoreStatus } from "@/data/app-store";

type ConflictSide = "local" | "remote";
type ConflictResolver = { resolveConflict: (conflictId: string, side: ConflictSide) => void };

const fieldLabel = (conflict: SyncConflict) => {
  if (conflict.field === "__record__") return "この記録";
  const labels: Record<string, string> = {
    timestamp: "時刻", milkMl: "ミルク量", milkMethod: "授乳方法",
    diaperKind: "おむつ", diaperSizeUsed: "おむつサイズ", temperature: "体温",
    weight: "体重", height: "身長", note: "メモ", babyId: "赤ちゃん",
    type: "記録の種類", displayName: "名前", birthDate: "生年月日",
    diaperSize: "おむつサイズ", diaperStockManagementEnabled: "おむつ在庫管理",
    sleepManagementEnabled: "睡眠管理",
  };
  if (conflict.path?.includes("diaperStockBySize")) {
    return `おむつ在庫（${conflict.path[conflict.path.length - 1]}）`;
  }
  return labels[conflict.field] ?? "設定";
};

const eventContext = (conflict: SyncConflict) => {
  const baby = conflict.babyId ? `赤ちゃん${conflict.babyId}` : "";
  const types: Record<string, string> = {
    milk: "ミルク", solidFood: "離乳食", diaper: "おむつ", sleepStart: "入眠",
    wake: "起床", daily: "一言メモ", temperature: "体温", weight: "体重", height: "身長",
  };
  const type = conflict.eventType ? types[conflict.eventType] ?? "記録" : "";
  return [baby, type].filter(Boolean).join("・");
};

const formatConflictValue = (conflict: SyncConflict, value: unknown, side: ConflictSide) => {
  if (conflict.field === "__record__") {
    if (value === null) return "削除する";
    return side === "local" ? "この端末の変更を使う" : "別の端末の変更を残す";
  }
  if (value === null || value === undefined || value === "") return "なし";
  if (conflict.field === "timestamp" && typeof value === "number") {
    return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }
  if (conflict.field === "milkMl") return `${value}ml`;
  if (conflict.field === "temperature") return `${value}℃`;
  if (conflict.field === "weight" && typeof value === "number") return `${value.toFixed(2)}kg`;
  if (conflict.field === "height") return `${value}cm`;
  if (conflict.field === "milkMethod") return value === "breast" ? "母乳" : value === "bottle" ? "哺乳瓶" : String(value);
  if (conflict.field === "diaperKind") {
    return value === "pee" ? "おしっこ" : value === "poop" ? "うんち" : value === "mix" ? "おしっこ＋うんち" : String(value);
  }
  if (typeof value === "boolean") return value ? "オン" : "オフ";
  return String(value);
};

export function SyncStatusOverlay({
  status,
  resolver,
}: {
  status: StoreStatus;
  resolver: ConflictResolver | null;
}) {
  const conflict = status.conflicts?.[0];

  return (
    <>
      {status.ready && status.error ? (
        <div
          role="status"
          className="pointer-events-none fixed left-1/2 top-[max(3.7rem,calc(env(safe-area-inset-top)+3.2rem))] z-[72] w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-full border bg-card/95 px-3 py-1.5 text-center text-xs font-semibold shadow-lg backdrop-blur"
        >
          {status.pending > 0
            ? "保存を待っています。通信が戻ると自動で保存します。"
            : "最新の状態を確認できません。通信が戻ると自動で再接続します。"}
        </div>
      ) : null}

      {conflict && resolver ? (
        <section
          role="dialog"
          aria-live="polite"
          aria-label="変更内容の確認"
          className="fixed bottom-[max(.75rem,env(safe-area-inset-bottom))] left-2 right-2 z-[90] mx-auto max-w-[680px] rounded-2xl border bg-card/95 p-4 shadow-2xl backdrop-blur"
        >
          <div className="text-sm font-extrabold">変更内容を確認してください</div>
          {eventContext(conflict) ? (
            <div className="mt-1 text-xs text-muted-foreground">{eventContext(conflict)}</div>
          ) : null}
          <div className="mt-3 text-sm font-bold">{fieldLabel(conflict)}</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([
              ["local", "この端末", conflict.localValue],
              ["remote", "別の端末", conflict.remoteValue],
            ] as const).map(([side, label, value]) => (
              <button
                key={side}
                type="button"
                className="min-w-0 rounded-xl border bg-background p-3 text-left active:scale-[.985]"
                onClick={() => resolver.resolveConflict(conflict.id, side)}
              >
                <span className="block text-[10px] text-muted-foreground">{label}</span>
                <span className="mt-0.5 block overflow-wrap-anywhere text-sm font-extrabold">
                  {formatConflictValue(conflict, value, side)}
                </span>
              </button>
            ))}
          </div>
          {(status.conflicts?.length ?? 0) > 1 ? (
            <div className="mt-2 text-right text-[10px] text-muted-foreground">
              確認が必要な変更 {status.conflicts?.length}件
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
