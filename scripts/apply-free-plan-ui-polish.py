from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected source not found: {label}")
    return text.replace(old, new, 1)


# App: Milk theme is available on Free and Settings knows whether premium gauges are enabled.
app_path = Path("src/App.tsx")
app = app_path.read_text()
app = replace_once(
    app,
    '''  useEffect(() => {
    const allowed = ["milk", "sakura", "sun", "forest"].includes(theme) && familyAccess?.features.themes;
    document.documentElement.dataset.theme = allowed ? theme : "dark";
    return () => { delete document.documentElement.dataset.theme; };
  }, [theme, familyAccess?.features.themes]);''',
    '''  useEffect(() => {
    const freeTheme = theme === "milk";
    const premiumTheme = ["sakura", "sun", "forest"].includes(theme) && familyAccess?.features.themes;
    document.documentElement.dataset.theme = freeTheme || premiumTheme ? theme : "dark";
    return () => { delete document.documentElement.dataset.theme; };
  }, [theme, familyAccess?.features.themes]);''',
    "theme access effect",
)
app = replace_once(
    app,
    '''        app={app}
        setApp={(updater) => {''',
    '''        app={app}
        premiumGaugesEnabled={Boolean(familyAccess?.features.gauges)}
        setApp={(updater) => {''',
    "SettingsModal premium gauge prop",
)
old_theme_condition = 'id!=="dark"&&!familyAccess?.features.themes'
if app.count(old_theme_condition) != 2:
    raise SystemExit(f"Expected 2 theme access conditions, found {app.count(old_theme_condition)}")
app = app.replace(
    old_theme_condition,
    'id!=="dark"&&id!=="milk"&&!familyAccess?.features.themes',
)
app_path.write_text(app)


# Settings: hide premium numeric gauge tuning entirely on Free.
settings_path = Path("src/components/SettingsModal.tsx")
settings = settings_path.read_text()
settings = replace_once(
    settings,
    "  app: AppState;\n  setApp:",
    "  app: AppState;\n  premiumGaugesEnabled?: boolean;\n  setApp:",
    "SettingsModal prop type",
)
settings = replace_once(
    settings,
    "  app,\n  setApp,",
    "  app,\n  premiumGaugesEnabled = false,\n  setApp,",
    "SettingsModal prop destructure",
)
milk_marker = '''                      <div className="space-y-2 rounded-lg border bg-background/40 p-3">
                        <Label htmlFor={`milk-window-${babyId}`}>ミルクゲージが空になる時間</Label>'''
start = settings.find(milk_marker)
if start < 0:
    raise SystemExit("Gauge settings start marker not found")
settings = (
    settings[:start]
    + "                      {premiumGaugesEnabled ? (\n                        <>\n"
    + settings[start:]
)
end_marker = '''                        </>
                      ) : null}'''
end = settings.find(end_marker, start)
if end < 0:
    raise SystemExit("Gauge settings end marker not found")
end += len(end_marker)
settings = settings[:end] + "\n                        </>\n                      ) : null}" + settings[end:]
settings_path.write_text(settings)


# AI advice: show the launcher on Free but keep it inert and visibly Premium-only.
ai_path = Path("src/components/AiAdviceLauncher.tsx")
ai = ai_path.read_text()
ai = replace_once(
    ai,
    'import { Sparkles } from "lucide-react";',
    'import { Sparkles } from "lucide-react";',
    "AI launcher icon import",
)
ai = replace_once(
    ai,
    '''  const openAdvice = () => {
    setOpen(true);''',
    '''  const openAdvice = () => {
    if (!access?.features.aiReview) return;
    setOpen(true);''',
    "AI launcher open guard",
)
ai = replace_once(
    ai,
    "  const launcher = (",
    "  const aiAdviceEnabled = Boolean(access?.features.aiReview);\n\n  const launcher = (",
    "AI enabled flag",
)
ai = replace_once(
    ai,
    '      className="h-8 select-none gap-1 px-2 text-xs"',
    '      className={`h-8 select-none gap-1 px-2 text-xs ${aiAdviceEnabled ? "" : "cursor-not-allowed opacity-45"}`}',
    "AI launcher disabled style",
)
ai = replace_once(
    ai,
    '''        openAdvice();
      }}
      aria-label="AIアドバイスを見る"''',
    '''        if (!aiAdviceEnabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        openAdvice();
      }}
      aria-disabled={!aiAdviceEnabled}
      aria-label={aiAdviceEnabled ? "AIアドバイスを見る" : "AIアドバイス（Premium限定）"}
      title={aiAdviceEnabled ? "AIアドバイス" : "Premiumで利用できます"}''',
    "AI launcher click/accessibility state",
)
ai = replace_once(
    ai,
    '''      <Sparkles className="h-4 w-4" />
      <span>AIアドバイス</span>''',
    '''      <Sparkles className="h-4 w-4" />
      <span>AIアドバイス</span>
      {!aiAdviceEnabled ? (
        <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary">Premium</span>
      ) : null}''',
    "AI Premium badge",
)
ai = replace_once(
    ai,
    '{access?.features.aiReview ? targets.map((target, index) => createPortal(launcher, target, `ai-advice-${index}`)) : null}',
    '{access ? targets.map((target, index) => createPortal(launcher, target, `ai-advice-${index}`)) : null}',
    "AI launcher visibility on free",
)
ai_path.write_text(ai)


# AI advice regression coverage for the Free visual state.
test_path = Path("src/components/AiAdviceLauncher.test.tsx")
test = test_path.read_text()
test = replace_once(
    test,
    "const premium={plan:'premium',canPreview:true,features:{aiReview:true,aiChat:true,dailySummaryEmail:true}};",
    "const premium={plan:'premium',canPreview:true,features:{aiReview:true,aiChat:true,dailySummaryEmail:true}};\nconst free={plan:'free',canPreview:true,features:{aiReview:false,aiChat:false,dailySummaryEmail:false}};",
    "free access fixture",
)
insert_after = "  beforeEach(()=>mock.service.mockReset());\n"
free_test = '''

  it('keeps AI advice visible but inactive on the free plan',async()=>{
    mock.service.mockImplementation(async(name)=>name==='getFamilyAccess'?free:free);
    render(<div><button aria-label="週間タイムラインを開く">timeline</button><AiAdviceLauncher/></div>);
    const launcher=await screen.findByRole('button',{name:'AIアドバイス（Premium限定）'});
    expect(launcher).toHaveAttribute('aria-disabled','true');
    expect(launcher).toHaveTextContent('Premium');
    fireEvent.click(launcher);
    expect(screen.queryByText('今日のAIアドバイス')).not.toBeInTheDocument();
  });
'''
test = replace_once(test, insert_after, insert_after + free_test, "free AI launcher test")
test_path.write_text(test)


# Pricing copy: Milk is Free; only Sakura/Sun/Forest are Premium themes.
tools_path = Path("src/components/AiTools.tsx")
tools = tools_path.read_text()
tools = replace_once(
    tools,
    '      "白・ピンク・イエローなど、気分や好みに合わせてTwinlyを着せ替え。毎日開くアプリだからこそ、見た目にもこだわれます。",',
    '      "無料版のナイト・ミルクに加えて、さくら・ひだまり・森の朝へ着せ替えできます。毎日開くアプリだからこそ、見た目にもこだわれます。",',
    "premium theme description",
)
tools = replace_once(
    tools,
    '  ["ホワイトノイズ", true, true],\n  ["各種お世話ゲージ", false, true],',
    '  ["ホワイトノイズ", true, true],\n  ["ナイト・ミルクテーマ", true, true],\n  ["各種お世話ゲージ", false, true],',
    "free theme comparison row",
)
tools = replace_once(
    tools,
    '  ["追加テーマ", false, true],',
    '  ["Premium限定テーマ（さくら・ひだまり・森）", false, true],',
    "premium theme comparison row",
)
tools_path.write_text(tools)


# Twin tabs: stretch as a rounded pill instead of pinching into an hourglass.
swipe_path = Path("src/lib/baby-tab-swipe-animator.ts")
swipe = swipe_path.read_text()
swipe = replace_once(
    swipe,
    "  will-change: left, width, transform, clip-path;",
    "  will-change: left, width, transform, border-radius;",
    "tab indicator will-change",
)
swipe = replace_once(
    swipe,
    "  animation: twinly-tab-slime-settle 390ms cubic-bezier(.2,.9,.28,1.25);",
    "  animation: twinly-tab-spring-settle 360ms cubic-bezier(.2,.9,.28,1.18);",
    "tab settle animation",
)
swipe = replace_once(
    swipe,
    '''@keyframes twinly-tab-slime-settle {
  0% { transform: scaleX(1.02) scaleY(.97); }
  38% { transform: scaleX(.965) scaleY(1.055); }
  68% { transform: scaleX(1.022) scaleY(.985); }
  86% { transform: scaleX(.995) scaleY(1.01); }
  100% { transform: scale(1); }
}''',
    '''@keyframes twinly-tab-spring-settle {
  0% { transform: scaleX(1.035) scaleY(.975); }
  45% { transform: scaleX(.982) scaleY(1.025); }
  72% { transform: scaleX(1.012) scaleY(.993); }
  100% { transform: scale(1); }
}''',
    "tab spring keyframes",
)
swipe = replace_once(
    swipe,
    '''        "height 320ms cubic-bezier(.2,.9,.3,1)",
        "clip-path 220ms ease-out",
        "border-radius 220ms ease-out",''',
    '''        "height 320ms cubic-bezier(.2,.9,.3,1)",
        "border-radius 180ms ease-out",''',
    "tab transition properties",
)
swipe = replace_once(
    swipe,
    '''    if (tension > 0.015) {
      const waist = Math.min(72, rect.width * 0.18) * tension;
      indicator.style.clipPath = `polygon(0 0, 100% 0, calc(100% - ${waist.toFixed(2)}px) 50%, 100% 100%, 0 100%, ${waist.toFixed(2)}px 50%)`;
      indicator.style.borderRadius = `${Math.round(7 + tension * 9)}px`;
      indicator.style.transform = `scaleX(${(1 + tension * 0.012).toFixed(4)}) scaleY(${(1 - tension * 0.075).toFixed(4)})`;
    } else {
      indicator.style.clipPath = "inset(0 round 8px)";
      indicator.style.borderRadius = "8px";
      indicator.style.transform = "scale(1)";
    }''',
    '''    if (tension > 0.015) {
      const pillRadius = lerp(8, Math.max(18, rect.height / 2), tension);
      indicator.style.clipPath = "none";
      indicator.style.borderRadius = `${pillRadius.toFixed(2)}px`;
      indicator.style.transform = `scaleY(${(1 - tension * 0.04).toFixed(4)})`;
    } else {
      indicator.style.clipPath = "none";
      indicator.style.borderRadius = "8px";
      indicator.style.transform = "scale(1)";
    }''',
    "remove hourglass deformation",
)
swipe_path.write_text(swipe)
