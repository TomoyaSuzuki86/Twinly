import type { LayoutMode } from "@/lib/appearance-preferences";
import { WIDE_SPLIT_LAYOUT_MIN_WIDTH_PX } from "@/lib/appearance-preferences";

const THEME_OPTIONS = [
  ["dark", "ナイト", "from-slate-950 to-indigo-950"],
  ["milk", "ミルク", "from-stone-50 to-amber-100"],
  ["sakura", "さくら", "from-rose-50 to-pink-200"],
  ["sun", "ひだまり", "from-amber-50 to-orange-200"],
  ["forest", "森の朝", "from-emerald-50 to-green-200"],
] as const;

export function AppearanceSettingsPanel({
  theme,
  layoutMode,
  premiumThemesEnabled,
  onSelectTheme,
  onSelectLayoutMode,
}: {
  theme: string;
  layoutMode: LayoutMode;
  premiumThemesEnabled: boolean;
  onSelectTheme: (theme: string) => void;
  onSelectLayoutMode: (layoutMode: LayoutMode) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">画面レイアウト</h3>
          <p className="text-sm text-muted-foreground">横長の端末で、双子の入力画面をどう表示するか選べます。</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSelectLayoutMode("single")}
            className={`rounded-xl border-2 p-3 text-left transition ${layoutMode === "single" ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border bg-card"}`}
          >
            <span className="block text-sm font-bold">1人ずつ表示</span>
            <span className="mt-1 block text-xs text-muted-foreground">従来どおり、双子タブで切り替えて画面いっぱいに表示</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectLayoutMode("split")}
            className={`rounded-xl border-2 p-3 text-left transition ${layoutMode === "split" ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border bg-card"}`}
          >
            <span className="block text-sm font-bold">左右2人表示</span>
            <span className="mt-1 block text-xs text-muted-foreground">横幅{WIDE_SPLIT_LAYOUT_MIN_WIDTH_PX}px以上で2人を同時表示。狭い画面では自動で1人表示</span>
          </button>
        </div>
      </section>
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">テーマ</h3>
          <p className="text-sm text-muted-foreground">背景・文字・ゲージをまとめて切り替えます。</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {THEME_OPTIONS.map(([id, label, colors]) => {
            const premiumOnly = id !== "dark" && id !== "milk";
            const disabled = premiumOnly && !premiumThemesEnabled;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onSelectTheme(id)}
                className={`rounded-xl border-2 bg-gradient-to-br ${colors} p-3 text-left ${theme === id ? "border-primary ring-2 ring-primary/30" : "border-border"} disabled:opacity-45`}
              >
                <span className="block text-sm font-bold text-slate-800">{label}</span>
                <span className="block text-xs text-slate-600">{disabled ? "有料限定" : "選択"}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
