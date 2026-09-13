from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path: str, old: str, new: str):
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, got {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "src/main.tsx",
    '''  if (percentMatch) {\n    const meta = document.createElement("span");\n    meta.className = "twinly-primary-action-dock-meta";\n    meta.textContent = `${percentMatch[1]}%`;\n    content.appendChild(meta);\n  }\n''',
    '''  if (percentMatch) {\n    const meta = document.createElement("span");\n    meta.className = "twinly-primary-action-dock-meta";\n    meta.textContent = `${percentMatch[1]}%`;\n    if (source.key === "sleep") {\n      const foregroundToken = source.button.getAttribute("aria-checked") === "true"\n        ? "--gauge-sleep-on"\n        : "--gauge-wake-on";\n      meta.style.color = `hsl(var(${foregroundToken}))`;\n    }\n    content.appendChild(meta);\n  }\n''',
)

replace_once(
    "src/App.tsx",
    '''              <p className="text-center text-[10px] leading-none text-muted-foreground">\n                ダブルクリック／長押しで音声入力\n              </p>\n''',
    '''              <p\n                className="overflow-hidden whitespace-nowrap text-center text-[10px] leading-none text-muted-foreground"\n                data-twinly-voice-hint="true"\n              >\n                <span className="hidden min-[480px]:inline">ダブルクリック／長押しで音声入力｜ヘッダー＝2人同時・タブ＝個別</span>\n                <span className="min-[480px]:hidden">ダブルクリック／長押しで音声入力</span>\n              </p>\n''',
)

replace_once(
    "src/lib/header-overflow-menu-v3.ts",
    '''const findHint = (header: HTMLElement) => {\n  const container = header.parentElement;\n  if (!container) return null;\n  return [...container.querySelectorAll('p')].find((node) => node.textContent?.trim() === HINT_TEXT) as HTMLParagraphElement | undefined;\n};\n''',
    '''const findHint = (header: HTMLElement) => {\n  const container = header.parentElement;\n  if (!container) return null;\n  return (\n    container.querySelector<HTMLParagraphElement>('p[data-twinly-voice-hint="true"]') ??\n    ([...container.querySelectorAll('p')].find((node) => node.textContent?.includes(HINT_TEXT)) as HTMLParagraphElement | undefined)\n  );\n};\n''',
)

replace_once(
    "src/components/BabyPanel.tsx",
    '''          <Button\n            size="lg"\n            className="relative h-28 select-none overflow-hidden [background:hsl(var(--gauge-milk-track))] p-0 text-2xl font-bold [color:hsl(var(--gauge-milk-text))] hover:[background:hsl(var(--gauge-milk-track))] [-webkit-touch-callout:none]"\n''',
    '''          <Button\n            data-tutorial="primary-action"\n            size="lg"\n            className="relative h-28 select-none overflow-hidden [background:hsl(var(--gauge-milk-track))] p-0 text-2xl font-bold [color:hsl(var(--gauge-milk-text))] hover:[background:hsl(var(--gauge-milk-track))] [-webkit-touch-callout:none]"\n''',
)
replace_once(
    "src/components/BabyPanel.tsx",
    '''          <Button\n            size="lg"\n            className="relative h-28 select-none overflow-hidden [background:hsl(var(--gauge-diaper-track))] p-0 text-2xl font-bold [color:hsl(var(--gauge-diaper-text))] hover:[background:hsl(var(--gauge-diaper-track))] [-webkit-touch-callout:none]"\n''',
    '''          <Button\n            data-tutorial="primary-action"\n            size="lg"\n            className="relative h-28 select-none overflow-hidden [background:hsl(var(--gauge-diaper-track))] p-0 text-2xl font-bold [color:hsl(var(--gauge-diaper-text))] hover:[background:hsl(var(--gauge-diaper-track))] [-webkit-touch-callout:none]"\n''',
)
replace_once(
    "src/components/BabyPanel.tsx",
    '''        <Button\n          disabled={sleepTransition !== null}\n          data-transition={sleepTransition || undefined}\n''',
    '''        <Button\n          data-tutorial="primary-action"\n          disabled={sleepTransition !== null}\n          data-transition={sleepTransition || undefined}\n''',
)
replace_once(
    "src/components/BabyPanel.tsx",
    '''        <div\n          className="-mx-1 overflow-x-auto px-1 pb-2"\n          data-horizontal-scroll="true"\n''',
    '''        <div\n          data-tutorial="log-summary"\n          className="-mx-1 overflow-x-auto px-1 pb-2"\n          data-horizontal-scroll="true"\n''',
)

p = ROOT / "src/components/IntroTutorial.tsx"
text = p.read_text(encoding="utf-8")

old = '''const targetResolvers: Array<() => HTMLElement | null> = [\n  () => document.querySelector<HTMLElement>('[data-tutorial="babies"]'),\n  () => activePanel()?.querySelector<HTMLElement>('[aria-label^="食事を記録"]') ?? null,\n  () => null,\n  () => null,\n  () => document.querySelector<HTMLElement>('[data-tutorial="baby-A"]'),\n  () => document.querySelector<HTMLElement>('[data-tutorial="header"]'),\n  () => document.querySelector<HTMLElement>('[data-tutorial="header"]'),\n  () => activePanel()?.querySelector<HTMLElement>('[data-tutorial="logs"]') ?? null,\n  () => null,\n  () => null,\n  () => document.querySelector<HTMLElement>('[aria-label="settings"]'),\n];\n\nconst TOTAL_STEPS = targetResolvers.length;\nconst scrollTargetIntoView = new Set([1, 7]);\n'''
new = '''const targetResolvers: Array<() => HTMLElement | null> = [\n  () => document.querySelector<HTMLElement>('[data-tutorial="babies"]'),\n  () => activePanel()?.querySelector<HTMLElement>('[data-tutorial="primary-action"]') ?? null,\n  () => null,\n  () => null,\n  () => document.querySelector<HTMLElement>('[data-tutorial="baby-A"]'),\n  () => document.querySelector<HTMLElement>('[data-tutorial="header"]'),\n  () => document.querySelector<HTMLElement>('[data-tutorial="header"]'),\n  () => activePanel()?.querySelector<HTMLElement>('[data-tutorial="logs"]') ?? null,\n  () => activePanel()?.querySelector<HTMLElement>('[data-tutorial="log-summary"]') ?? null,\n  () => activePanel()?.querySelector<HTMLElement>('[aria-label="週間タイムラインを開く"]') ?? null,\n  () => null,\n  () => document.querySelector<HTMLElement>('[aria-label="settings"]'),\n];\n\nconst TOTAL_STEPS = targetResolvers.length;\nconst scrollTargetIntoView = new Set([1, 7, 8, 9]);\n'''
if text.count(old) != 1: raise RuntimeError("target resolver block mismatch")
text = text.replace(old, new, 1)
text = text.replace('  const [rect, setRect] = useState<Rect | null>(null);\n', '  const [rect, setRect] = useState<Rect | null>(null);\n  const [extraRects, setExtraRects] = useState<Rect[]>([]);\n', 1)
text = text.replace('    setRect(null);\n', '    setRect(null);\n    setExtraRects([]);\n', 1)

old = '''      const box = target?.getBoundingClientRect();\n      if (!box || !box.width || !box.height) {\n        setRect(null);\n        return;\n      }\n\n      const left = Math.max(8, box.left - 4);\n      const top = Math.max(8, box.top - 4);\n      setRect({\n        top,\n        left,\n        width: Math.min(box.width + 8, window.innerWidth - left - 8),\n        height: box.height + 8,\n      });\n'''
new = '''      const box = target?.getBoundingClientRect();\n      if (!box || !box.width || !box.height) {\n        setRect(null);\n        setExtraRects([]);\n        return;\n      }\n\n      const toRect = (targetBox: DOMRect): Rect => {\n        const left = Math.max(8, targetBox.left - 4);\n        const top = Math.max(8, targetBox.top - 4);\n        return {\n          top,\n          left,\n          width: Math.min(targetBox.width + 8, window.innerWidth - left - 8),\n          height: targetBox.height + 8,\n        };\n      };\n\n      setRect(toRect(box));\n      if (step === 1) {\n        const actionTargets = Array.from(activePanel()?.querySelectorAll<HTMLElement>('[data-tutorial="primary-action"]') ?? []);\n        setExtraRects(actionTargets.slice(1).map((action) => toRect(action.getBoundingClientRect())));\n      } else {\n        setExtraRects([]);\n      }\n'''
if text.count(old) != 1: raise RuntimeError("measure block mismatch")
text = text.replace(old, new, 1)

text = text.replace('    "記録は、あとから直せます",\n    "タイムラインで、1週間を見渡す",\n', '    "記録は、あとから直せます",\n    "ログ下の集計を、すぐ確認",\n    "タイムラインで、1週間を見渡す",\n', 1)
text = text.replace('    "本番では保存直後なら「取り消す」で戻せます。あとからはログを開いて編集・削除できます。",\n    "タイムラインでは、1週間のミルク・離乳食・おむつ・睡眠を24時間軸でまとめて確認できます。生活リズムをざっと振り返りたいときに便利です。",\n', '    "本番では保存直後なら「取り消す」で戻せます。あとからはログを開いて編集・削除できます。",\n    "ログ見出しのすぐ下には、その日の食事・おむつ・睡眠の集計カードがあります。横にスワイプして3項目を見比べられ、各カードをタップすると詳しい履歴を開けます。",\n    "タイムラインでは、1週間のミルク・離乳食・おむつ・睡眠を24時間軸でまとめて確認できます。生活リズムをざっと振り返りたいときに便利です。",\n', 1)
text = text.replace('  const interactiveSpotlight = step === 4 || step === 5 || step === 10;\n', '  const interactiveSpotlight = step === 4 || step === 5 || step === 11;\n', 1)
text = text.replace('    step === 10 ? "設定を開く" :\n    "チュートリアル対象";\n', '    step === 8 ? "食事・おむつ・睡眠の集計" :\n    step === 9 ? "週間タイムラインを開くボタン" :\n    step === 11 ? "設定を開く" :\n    "チュートリアル対象";\n', 1)
text = text.replace('    const settingsButton = targetResolvers[10]?.();\n', '    const settingsButton = targetResolvers[11]?.();\n', 1)
text = text.replace('              if (step === 10) completeAndOpenSettings();\n', '              if (step === 11) completeAndOpenSettings();\n', 1)

needle = '''          />}\n\n          <section className="twinly-tutorial-card">\n'''
replacement = '''          />}\n          {extraRects.map((extraRect, index) => (\n            <span key={`tutorial-extra-spotlight-${index}`} className="twinly-tutorial-spotlight twinly-tutorial-spotlight-static" style={extraRect} aria-hidden="true" />\n          ))}\n\n          <section\n            className={`twinly-tutorial-card ${step === 9 ? "twinly-tutorial-card-above-target" : ""}`}\n            style={step === 9 && rect ? { top: `${Math.max(12, rect.top - 12)}px` } : undefined}\n          >\n'''
if text.count(needle) != 1: raise RuntimeError("card anchor mismatch")
text = text.replace(needle, replacement, 1)

text = text.replace('''              {step === 8 && <div className="twinly-tutorial-demo">\n''', '''              {step === 8 && <div className="twinly-tutorial-demo">\n                <div className="grid grid-cols-3 gap-2 text-center text-xs">\n                  <div className="rounded-lg border bg-card px-2 py-3 font-bold">食事<br /><span className="text-muted-foreground">量・回数</span></div>\n                  <div className="rounded-lg border bg-card px-2 py-3 font-bold">おむつ<br /><span className="text-muted-foreground">回数</span></div>\n                  <div className="rounded-lg border bg-card px-2 py-3 font-bold">睡眠<br /><span className="text-muted-foreground">時間・回数</span></div>\n                </div>\n                <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">横にスワイプして確認。カードをタップすると、その項目の詳しい履歴を開けます。</p>\n              </div>}\n\n              {step === 9 && <div className="twinly-tutorial-demo">\n''', 1)
text = text.replace('''              {step === 9 && <div className="twinly-tutorial-demo">\n                <div className="grid grid-cols-2 gap-2">\n''', '''              {step === 10 && <div className="twinly-tutorial-demo">\n                <div className="grid grid-cols-2 gap-2">\n''', 1)
text = text.replace('''              {step === 10 && <div className="twinly-tutorial-demo">\n                <div className="flex items-center justify-center gap-2 text-sm font-semibold">\n''', '''              {step === 11 && <div className="twinly-tutorial-demo">\n                <div className="flex items-center justify-center gap-2 text-sm font-semibold">\n''', 1)
p.write_text(text, encoding="utf-8")

css_path = ROOT / "src/components/intro-tutorial.css"
css = css_path.read_text(encoding="utf-8")
if ".twinly-tutorial-spotlight-static" not in css:
    css += '\n.twinly-tutorial-spotlight-static { pointer-events: none; border-color: rgb(255 255 255 / .96); box-shadow: 0 0 0 9999px transparent, 0 0 0 5px rgb(255 255 255 / .18); }\n.twinly-tutorial-card-above-target { bottom: auto; transform: translate(-50%, -100%); max-height: min(52dvh, 420px); }\n'
css_path.write_text(css, encoding="utf-8")

test_path = ROOT / "src/components/IntroTutorial.test.tsx"
test = test_path.read_text(encoding="utf-8")
test = test.replace('    <button aria-label="食事を記録">食事</button>\n    <button role="switch" aria-checked="false" onClick={onLiveSleep}>実画面の睡眠</button>', '    <button data-tutorial="primary-action" aria-label="食事を記録">食事</button>\n    <button data-tutorial="primary-action" aria-label="おむつを記録">おむつ</button>\n    <button data-tutorial="primary-action" role="switch" aria-checked="false" onClick={onLiveSleep}>実画面の睡眠</button>')
test = test.replace('    <div data-tutorial="logs">ログ</div>\n', '    <div data-tutorial="logs">ログ</div>\n    <div data-tutorial="log-summary">食事・おむつ・睡眠の集計</div>\n    <button aria-label="週間タイムラインを開く">タイムライン</button>\n')
test = test.replace('starts the eleven-step tutorial', 'starts the twelve-step tutorial')
test = test.replace('"1 / 11"', '"1 / 12"')
test = test.replace('"2 / 11"', '"2 / 12"')
test_path.write_text(test, encoding="utf-8")

for temporary in [ROOT / "scripts/apply-tutorial-polish.py", ROOT / ".github/workflows/apply-tutorial-polish.yml"]:
    if temporary.exists(): temporary.unlink()
print("Tutorial polish applied")
