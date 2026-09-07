from pathlib import Path

app_path = Path("src/App.tsx")
app = app_path.read_text(encoding="utf-8-sig")

if "twinly-layout:" not in app:
    anchor = '  const sharedAccessBlocked = Boolean(familyMember && familyMember.role !== "owner" && !familyAccess?.features.familySharing);\n'
    layout_state = '''  const [layoutMode, setLayoutMode] = useState<"single" | "split">("single");
  useEffect(() => {
    if (!family?.id) {
      setLayoutMode("single");
      return;
    }
    try {
      setLayoutMode(localStorage.getItem(`twinly-layout:${family.id}`) === "split" ? "split" : "single");
    } catch {
      setLayoutMode("single");
    }
  }, [family?.id]);
  useEffect(() => {
    document.documentElement.dataset.twinlyLayout = layoutMode;
    return () => {
      delete document.documentElement.dataset.twinlyLayout;
    };
  }, [layoutMode]);
'''
    if anchor not in app:
        raise SystemExit("App layout-state anchor not found")
    app = app.replace(anchor, layout_state + anchor, 1)

    replacements = [
        (
            '<Tabs value={selectedBabyTab} onValueChange={(value) => setSelectedBabyTab(value as BabyId)} className="w-full">',
            '<Tabs value={selectedBabyTab} onValueChange={(value) => setSelectedBabyTab(value as BabyId)} className="twinly-baby-tabs w-full">',
        ),
        (
            'className={`grid h-auto w-full gap-1 p-1 min-[430px]:grid-cols-2 ${',
            'className={`twinly-baby-tabs-list grid h-auto w-full gap-1 p-1 min-[430px]:grid-cols-2 ${',
        ),
        ('className="touch-auto"', 'className="twinly-baby-tabs-panels touch-auto"'),
        (
            '<TabsContent forceMount value="A" className="mt-1 data-[state=inactive]:hidden">',
            '<TabsContent forceMount value="A" className="twinly-baby-tabs-content mt-1 data-[state=inactive]:hidden">',
        ),
        (
            '<TabsContent forceMount value="B" className="mt-1 data-[state=inactive]:hidden">',
            '<TabsContent forceMount value="B" className="twinly-baby-tabs-content mt-1 data-[state=inactive]:hidden">',
        ),
    ]
    for old, new in replacements:
        if old not in app:
            raise SystemExit(f"App replacement anchor not found: {old[:80]}")
        app = app.replace(old, new, 1)

    timeline_anchor = '                onOpenTimeline={() => setTimelineModalOpen(true)}'
    first = app.find(timeline_anchor)
    if first < 0:
        raise SystemExit("First timeline callback not found")
    app = (
        app[:first]
        + '                onOpenTimeline={() => { setSelectedBabyTab("A"); setTimelineModalOpen(true); }}'
        + app[first + len(timeline_anchor) :]
    )
    second = app.find(timeline_anchor, first + 1)
    if second < 0:
        raise SystemExit("Second timeline callback not found")
    app = (
        app[:second]
        + '                onOpenTimeline={() => { setSelectedBabyTab("B"); setTimelineModalOpen(true); }}'
        + app[second + len(timeline_anchor) :]
    )

    appearance_start = app.find(
        '        appearance={<section className="space-y-3"><div><h3 className="font-semibold">テーマ</h3>'
    )
    if appearance_start < 0:
        raise SystemExit("Appearance block start not found")
    appearance_end = app.find("\n        planAi=", appearance_start)
    if appearance_end < 0:
        raise SystemExit("Appearance block end not found")
    appearance = '''        appearance={
          <div className="space-y-6">
            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">画面レイアウト</h3>
                <p className="text-sm text-muted-foreground">横長の端末で、双子の入力画面をどう表示するか選べます。</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLayoutMode("single");
                    try { localStorage.setItem(`twinly-layout:${family.id}`, "single"); } catch {}
                  }}
                  className={`rounded-xl border-2 p-3 text-left transition ${layoutMode === "single" ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border bg-card"}`}
                >
                  <span className="block text-sm font-bold">1人ずつ表示</span>
                  <span className="mt-1 block text-xs text-muted-foreground">従来どおり、双子タブで切り替えて画面いっぱいに表示</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLayoutMode("split");
                    try { localStorage.setItem(`twinly-layout:${family.id}`, "split"); } catch {}
                  }}
                  className={`rounded-xl border-2 p-3 text-left transition ${layoutMode === "split" ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border bg-card"}`}
                >
                  <span className="block text-sm font-bold">左右2人表示</span>
                  <span className="mt-1 block text-xs text-muted-foreground">横幅1180px以上で2人を同時表示。狭い画面では自動で1人表示</span>
                </button>
              </div>
            </section>
            <section className="space-y-3">
              <div><h3 className="font-semibold">テーマ</h3><p className="text-sm text-muted-foreground">背景・文字・ゲージをまとめて切り替えます。</p></div>
              <div className="grid grid-cols-2 gap-2">{[
                ["dark", "ナイト", "from-slate-950 to-indigo-950"], ["milk", "ミルク", "from-stone-50 to-amber-100"],
                ["sakura", "さくら", "from-rose-50 to-pink-200"], ["sun", "ひだまり", "from-amber-50 to-orange-200"],
                ["forest", "森の朝", "from-emerald-50 to-green-200"]
              ].map(([id,label,colors]) => <button key={id} type="button" disabled={id!=="dark"&&!familyAccess?.features.themes} onClick={() => { setTheme(id); try { localStorage.setItem(`twinly-theme:${family.id}`, id); } catch {} }} className={`rounded-xl border-2 bg-gradient-to-br ${colors} p-3 text-left ${theme===id ? "border-primary ring-2 ring-primary/30" : "border-border"} disabled:opacity-45`}><span className="block text-sm font-bold text-slate-800">{label}</span><span className="block text-xs text-slate-600">{id!=="dark"&&!familyAccess?.features.themes ? "有料限定" : "選択"}</span></button>)}</div>
            </section>
          </div>
        }'''
    app = app[:appearance_start] + appearance + app[appearance_end:]
    app_path.write_text(app, encoding="utf-8")

css_path = Path("src/theme-polish.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* Wide twin split layout */"
if marker not in css:
    css += '''

/* Wide twin split layout */
@media (min-width: 1180px) {
  html[data-twinly-layout="split"] .twinly-baby-tabs-list {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  html[data-twinly-layout="split"] .twinly-baby-tabs-list [role="tab"] {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    box-shadow: 0 1px 2px hsl(var(--foreground) / 0.08);
    opacity: 1;
  }

  html[data-twinly-layout="split"] .twinly-baby-tabs-list [data-testid$="-mini-gauge"] {
    display: none !important;
  }

  html[data-twinly-layout="split"] .twinly-baby-tabs-panels {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 0.75rem;
  }

  html[data-twinly-layout="split"] .twinly-baby-tabs-content {
    min-width: 0;
    margin-top: 0.25rem;
  }

  html[data-twinly-layout="split"] .twinly-baby-tabs-content[data-state="inactive"] {
    display: block !important;
  }
}
'''
    css_path.write_text(css, encoding="utf-8")
