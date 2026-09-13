from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected source not found: {label}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, repl: str, label: str) -> str:
    next_text, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Expected regex source not found: {label}")
    return next_text

# AiAdviceLauncher: remove all home/portal launcher DOM. Keep only access state + dialog,
# opened directly from the header menu through a custom event.
ai_path = Path("src/components/AiAdviceLauncher.tsx")
ai = ai_path.read_text()
ai = replace_once(
    ai,
    'import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";\nimport { createPortal } from "react-dom";\nimport { Sparkles } from "lucide-react";\n',
    'import { useEffect, useRef, useState } from "react";\n',
    "launcher imports",
)
ai = replace_once(
    ai,
    'const TARGET_SELECTOR = \'button[aria-label="週間タイムラインを開く"]\';\nconst CONSENT_KEY = "twinly-ai-review-consent-v3";\nconst JST = 9 * 60 * 60 * 1000;\nconst LAUNCHER_SWIPE_DISTANCE_PX = 14;\n',
    'const CONSENT_KEY = "twinly-ai-review-consent-v3";\nconst JST = 9 * 60 * 60 * 1000;\n',
    "launcher constants",
)
ai = sub_once(
    ai,
    r'type SwipeDirection = "left" \| "right";.*?\nexport function AiAdviceLauncher\(\) \{',
    'export function AiAdviceLauncher() {',
    "launcher swipe helpers",
)
ai = replace_once(
    ai,
    '  const [targets, setTargets] = useState<HTMLElement[]>([]);\n  const targetMap = useRef(new Map<HTMLButtonElement, HTMLSpanElement>());\n',
    '',
    "portal target state",
)
ai = replace_once(
    ai,
    '  const inFlight = useRef(false);\n  const suppressLauncherClickUntilRef = useRef(0);\n  const launcherSwipeRef = useRef<LauncherSwipe | null>(null);\n',
    '  const inFlight = useRef(false);\n',
    "launcher refs",
)
ai = sub_once(
    ai,
    r'  useEffect\(\(\) => \{\n    const syncTargets = \(\) => \{.*?\n  \}, \[\]\);\n\n',
    '',
    "portal target effect",
)
ai = sub_once(
    ai,
    r'  useEffect\(\(\) => \{\n    if \(!targets\.length\) \{ setAccess\(null\); return; \}\n    let active = true;.*?\n  \}, \[targets\.length\]\);',
    '''  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await callService<FamilyAccess>("getFamilyAccess");
        if (active) setAccess(next);
      } catch {
        if (active) setAccess(null);
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const state = access === null ? "loading" : access.features.aiReview ? "enabled" : "premium-required";
    document.documentElement.dataset.twinlyAiAdvice = state;
    window.dispatchEvent(new CustomEvent("twinly-ai-advice-state", { detail: { state } }));
    return () => {
      if (document.documentElement.dataset.twinlyAiAdvice === state) {
        delete document.documentElement.dataset.twinlyAiAdvice;
      }
    };
  }, [access]);''',
    "access refresh effect",
)
ai = sub_once(
    ai,
    r'  const releasePointer = \(button: HTMLButtonElement, pointerId: number\) => \{.*?\n  const loadReview = async \(\) => \{',
    '  const loadReview = async () => {',
    "launcher pointer handlers",
)
open_block = '''  const openAdvice = () => {
    if (!access?.features.aiReview) return;
    setOpen(true);
    setError("");
    if (consent) void loadReview();
  };'''
ai = replace_once(
    ai,
    open_block,
    open_block + '''

  useEffect(() => {
    const handleOpen = () => openAdvice();
    window.addEventListener("twinly-ai-advice-open", handleOpen);
    return () => window.removeEventListener("twinly-ai-advice-open", handleOpen);
  }, [access, consent, review]);''',
    "menu open event",
)
ai = sub_once(
    ai,
    r'\n  const aiAdviceEnabled = Boolean\(access\?\.features\.aiReview\);\n\n  const launcher = \(.*?\n  \);\n\n  return \(',
    '\n\n  return (',
    "home launcher element",
)
ai = replace_once(
    ai,
    '    <>\n      {access ? targets.map((target, index) => createPortal(launcher, target, `ai-advice-${index}`)) : null}\n      <Dialog open={open} onOpenChange={setOpen}>',
    '    <>\n      <Dialog open={open} onOpenChange={setOpen}>',
    "portal render",
)
ai_path.write_text(ai)

# Header menu: AI advice is a first-class menu item, not a proxy that clicks a hidden home button.
menu_path = Path("src/lib/header-overflow-menu-v3.ts")
menu = menu_path.read_text()
menu = replace_once(
    menu,
    'const HINT_TEXT = \'ダブルクリック／長押しで音声入力\';\nconst AI_ADVICE_SELECTOR = \'button[aria-label="AIアドバイスを見る"]\';\n',
    'const HINT_TEXT = \'ダブルクリック／長押しで音声入力\';\n',
    "AI selector constant",
)
menu = replace_once(menu, '    ${AI_ADVICE_SELECTOR} { display:none !important; }\n', '', "hidden AI CSS")
menu = replace_once(
    menu,
    "    #${MENU_ID} .twinly-menu-item:hover { background:hsl(var(--accent)); }\n    #${MENU_ID} .twinly-menu-item svg { width:1.05rem;height:1.05rem;flex:0 0 auto; }",
    "    #${MENU_ID} .twinly-menu-item:hover { background:hsl(var(--accent)); }\n    #${MENU_ID} .twinly-menu-item:disabled { opacity:.45;cursor:not-allowed; }\n    #${MENU_ID} .twinly-menu-item:disabled:hover { background:transparent; }\n    #${MENU_ID} .twinly-menu-item svg { width:1.05rem;height:1.05rem;flex:0 0 auto; }\n    #${MENU_ID} .twinly-menu-premium { margin-left:auto;border-radius:9999px;background:hsl(var(--primary) / .12);color:hsl(var(--primary));padding:.12rem .38rem;font-size:9px;font-weight:800;letter-spacing:.01em; }",
    "menu disabled styles",
)
menu = replace_once(
    menu,
    'const stopHeaderGesture = (event: Event) => event.stopPropagation();\n\nconst getAiAdviceButton = () => document.querySelector<HTMLButtonElement>(AI_ADVICE_SELECTOR);\n',
    'const stopHeaderGesture = (event: Event) => event.stopPropagation();\n',
    "hidden button lookup",
)
old_state = '''const updateAiMenuVisibility = () => {
  const item = document.querySelector<HTMLButtonElement>(`#${MENU_ID} [data-menu-action="ai-advice"]`);
  if (item) item.hidden = !getAiAdviceButton();
};'''
new_state = '''const updateAiMenuState = () => {
  const item = document.querySelector<HTMLButtonElement>(`#${MENU_ID} [data-menu-action="ai-advice"]`);
  if (!item) return;
  const state = document.documentElement.dataset.twinlyAiAdvice ?? "loading";
  const enabled = state === "enabled";
  const premiumRequired = state === "premium-required";
  if (item.disabled !== !enabled) item.disabled = !enabled;
  const ariaDisabled = String(!enabled);
  if (item.getAttribute("aria-disabled") !== ariaDisabled) item.setAttribute("aria-disabled", ariaDisabled);
  const title = enabled ? "AIアドバイス" : premiumRequired ? "Premiumで利用できます" : "利用状態を確認しています";
  if (item.title !== title) item.title = title;
  const html = `${icons.sparkles}<span>AIアドバイス</span>${premiumRequired ? '<span class="twinly-menu-premium">Premium</span>' : ''}`;
  if (item.innerHTML !== html) item.innerHTML = html;
};'''
menu = replace_once(menu, old_state, new_state, "AI menu state updater")
menu = replace_once(
    menu,
    "    const aiItem = createMenuItem('AIアドバイス', icons.sparkles, () => getAiAdviceButton()?.click());",
    "    const aiItem = createMenuItem('AIアドバイス', icons.sparkles, () => window.dispatchEvent(new Event('twinly-ai-advice-open')));",
    "direct AI menu action",
)
menu = replace_once(menu, '  updateAiMenuVisibility();\n', '  updateAiMenuState();\n', "AI menu update call")
menu += '\nwindow.addEventListener("twinly-ai-advice-state", () => renderSafely());\n'
menu_path.write_text(menu)

# The panel-level AI button no longer exists, so the animator does not need a dedicated AI gesture path.
swipe_path = Path("src/lib/baby-tab-swipe-animator.ts")
swipe = swipe_path.read_text()
swipe = replace_once(swipe, '  tabRects: RelativeRect[];\n  startedOnAiAdvice: boolean;\n', '  tabRects: RelativeRect[];\n', "AI session flag")
swipe = replace_once(
    swipe,
    'const PANELS_SELECTOR = ".twinly-baby-tabs-panels";\nconst AI_ADVICE_SELECTOR = \'[data-twinly-ai-advice-target="true"]\';\nconst READY_CLASS = "twinly-fluid-tabs-ready";\n',
    'const PANELS_SELECTOR = ".twinly-baby-tabs-panels";\nconst READY_CLASS = "twinly-fluid-tabs-ready";\n',
    "AI animator selector",
)
swipe = replace_once(
    swipe,
    'const SETTLING_CLASS = "twinly-fluid-tab-indicator-settling";\nconst AI_ADVICE_SWIPE_DISTANCE_PX = 20;\nconst AI_ADVICE_CLICK_SUPPRESS_MS = 800;\n',
    'const SETTLING_CLASS = "twinly-fluid-tab-indicator-settling";\n',
    "AI animator constants",
)
swipe = replace_once(swipe, '  let settlingTimer = 0;\n  let suppressAiAdviceClickUntil = 0;\n', '  let settlingTimer = 0;\n', "AI click suppression state")
swipe = replace_once(
    swipe,
    '      activeIndex,\n      tabRects: tabs.map((tab) => getRelativeRect(tab, list!)),\n      startedOnAiAdvice: Boolean(target.closest(AI_ADVICE_SELECTOR)),\n',
    '      activeIndex,\n      tabRects: tabs.map((tab) => getRelativeRect(tab, list!)),\n',
    "AI touch-start flag",
)
swipe = sub_once(
    swipe,
    r'\n    // The AI launcher is portaled into BabyPanel, so React\'s normal panel touch handlers do not.*?\n    if \(horizontal < 7 \|\| horizontal < vertical \* 0\.72\) return;',
    '\n    if (horizontal < 7 || horizontal < vertical * 0.72) return;',
    "AI touch-move special case",
)
swipe = sub_once(
    swipe,
    r'\n  const handleClickCapture = \(event: MouseEvent\) => \{.*?\n  \};\n',
    '\n',
    "AI click capture",
)
swipe = replace_once(swipe, '  document.addEventListener("touchcancel", handleTouchCancel, { capture: true, passive: true });\n  document.addEventListener("click", handleClickCapture, true);\n', '  document.addEventListener("touchcancel", handleTouchCancel, { capture: true, passive: true });\n', "AI click listener")
swipe_path.write_text(swipe)

# Replace launcher tests with menu-event tests and assert there is no home AI button DOM.
test_path = Path("src/components/AiAdviceLauncher.test.tsx")
test_path.write_text('''import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AiAdviceLauncher} from './AiAdviceLauncher';

const mock=vi.hoisted(()=>({service:vi.fn()}));
vi.mock('@/lib/ai',()=>({callService:mock.service}));

const premium={plan:'premium',canPreview:true,features:{aiReview:true,aiChat:true,dailySummaryEmail:true}};
const free={plan:'free',canPreview:true,features:{aiReview:false,aiChat:false,dailySummaryEmail:false}};

describe('AI advice menu integration',()=>{
  afterEach(()=>{cleanup();localStorage.clear();delete document.documentElement.dataset.twinlyAiAdvice;});
  beforeEach(()=>mock.service.mockReset());

  it('does not create a home launcher element and keeps free access inactive',async()=>{
    mock.service.mockImplementation(async(name)=>name==='getFamilyAccess'?free:free);
    render(<div><button aria-label="週間タイムラインを開く">timeline</button><AiAdviceLauncher/></div>);
    await waitFor(()=>expect(document.documentElement.dataset.twinlyAiAdvice).toBe('premium-required'));
    expect(document.querySelector('[data-twinly-ai-advice-button="true"]')).toBeNull();
    expect(document.querySelector('button[aria-label="AIアドバイスを見る"]')).toBeNull();
    window.dispatchEvent(new Event('twinly-ai-advice-open'));
    expect(screen.queryByText('今日のAIアドバイス')).not.toBeInTheDocument();
  });

  it('opens directly from the menu event for premium and keeps AI question controls working',async()=>{
    mock.service.mockImplementation(async(name,data)=>{
      if(name==='getFamilyAccess')return premium;
      if(name==='twinlyAi'&&data?.mode==='review')return {observations:'最近は安定しています',checks:'今日も睡眠を確認してください',generatedAt:Date.now()};
      if(name==='twinlyAi'&&data?.mode==='ask')return {answer:'直近の集計では大きな変化はありません。',source:'review',generatedAt:Date.now()};
      return premium;
    });

    render(<div><button aria-label="週間タイムラインを開く">timeline</button><AiAdviceLauncher/></div>);
    await waitFor(()=>expect(document.documentElement.dataset.twinlyAiAdvice).toBe('enabled'));
    expect(document.querySelector('[data-twinly-ai-advice-button="true"]')).toBeNull();
    window.dispatchEvent(new Event('twinly-ai-advice-open'));
    await screen.findByText('今日のAIアドバイス');
    expect(screen.queryByLabelText('AIへの質問')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'同意してアドバイスを見る'}));
    await screen.findByText('最近は安定しています');

    expect(screen.getByText('AIに質問する')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'start voice input'})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('AIへの質問'),{target:{value:'最近、睡眠は減ってる？'}});
    fireEvent.click(screen.getByRole('button',{name:'質問する'}));
    expect(await screen.findByText('直近の集計では大きな変化はありません。')).toBeInTheDocument();
    await waitFor(()=>expect(mock.service.mock.calls.some(([name,data])=>name==='twinlyAi'&&data?.mode==='ask')).toBe(true));
  });
});
''')

# The old animator test existed only for the removed panel-level AI launcher workaround.
old_animator_test = Path("src/lib/baby-tab-swipe-animator.test.ts")
if old_animator_test.exists():
    old_animator_test.unlink()

# Keep CI naming aligned with the new architecture.
dev_workflow = Path(".github/workflows/firebase-hosting-development.yml")
workflow_text = dev_workflow.read_text()
workflow_text = workflow_text.replace(
    '# Keep the development preview blocking the AI swipe regression that previously reached preview.\n      - name: Test AI advice swipe regression',
    '# Keep the development preview blocking the AI advice menu regression.\n      - name: Test AI advice menu regression',
)
dev_workflow.write_text(workflow_text)
