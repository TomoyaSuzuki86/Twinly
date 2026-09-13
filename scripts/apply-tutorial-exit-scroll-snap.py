from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


tutorial = Path("src/components/IntroTutorial.tsx")
replace_once(
    tutorial,
    '  const [extraRects, setExtraRects] = useState<Rect[]>([]);\n',
    '  const [extraRects, setExtraRects] = useState<Rect[]>([]);\n  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);\n',
)
replace_once(
    tutorial,
    '    setExtraRects([]);\n    setTutorialSleeping(false);\n',
    '    setExtraRects([]);\n    setExitConfirmOpen(false);\n    setTutorialSleeping(false);\n',
)
replace_once(
    tutorial,
    '    setVoiceListening(false);\n    setOpen(false);\n    void finishTutorial(uid, outcome);\n',
    '    setVoiceListening(false);\n    setExitConfirmOpen(false);\n    setOpen(false);\n    void finishTutorial(uid, outcome);\n',
)
replace_once(
    tutorial,
    '              <Button variant="ghost" size="sm" onClick={skipCurrentStep}>スキップ</Button>\n',
    '              <div className="flex items-center gap-1">\n                <Button variant="ghost" size="sm" onClick={skipCurrentStep}>スキップ</Button>\n                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setExitConfirmOpen(true)}>終了</Button>\n              </div>\n',
)
replace_once(
    tutorial,
    '    </Dialog.Root>\n\n    <SleepRecordModal\n',
    '''    </Dialog.Root>\n\n    <Dialog.Root open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>\n      <Dialog.Portal>\n        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60" />\n        <Dialog.Content\n          className="fixed left-1/2 top-1/2 z-[91] w-[min(90vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-5 shadow-2xl"\n          aria-describedby="tutorial-exit-description"\n        >\n          <Dialog.Title className="text-lg font-bold">チュートリアルを終了しますか？</Dialog.Title>\n          <Dialog.Description id="tutorial-exit-description" className="mt-2 text-sm leading-relaxed text-muted-foreground">\n            ここで終了すると、次回から自動では表示されません。必要なときは設定からもう一度チュートリアルを開始できます。\n          </Dialog.Description>\n          <div className="mt-5 flex justify-end gap-2">\n            <Button variant="outline" onClick={() => setExitConfirmOpen(false)}>キャンセル</Button>\n            <Button onClick={() => finish("skipped")}>終了する</Button>\n          </div>\n        </Dialog.Content>\n      </Dialog.Portal>\n    </Dialog.Root>\n\n    <SleepRecordModal\n''',
)


test = Path("src/components/IntroTutorial.test.tsx")
replace_once(
    test,
    '''  it("allows replay after completion", async () => {\n''',
    '''  it("asks for confirmation before ending the whole tutorial", async () => {\n    setup();\n    await screen.findByText("まずは、記録する子を選ぶ");\n\n    fireEvent.click(screen.getByText("終了"));\n    expect(screen.getByText("チュートリアルを終了しますか？")).toBeTruthy();\n    expect(finishTutorial).not.toHaveBeenCalled();\n\n    fireEvent.click(screen.getByText("キャンセル"));\n    expect(screen.queryByText("チュートリアルを終了しますか？")).toBeNull();\n    expect(screen.getByText("まずは、記録する子を選ぶ")).toBeTruthy();\n\n    fireEvent.click(screen.getByText("終了"));\n    fireEvent.click(screen.getByText("終了する"));\n\n    await waitFor(() => expect(finishTutorial).toHaveBeenCalledWith("parent-one", "skipped"));\n    expect(screen.queryByText("まずは、記録する子を選ぶ")).toBeNull();\n  });\n\n  it("allows replay after completion", async () => {\n''',
)


morph = Path("src/components/FamilyAccountIconEnhancer.tsx")
replace_once(
    morph,
    'const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;\n',
    '''const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;\n\nconst MORPH_START_INTRUSION = -4;\nconst MORPH_FINAL_INTRUSION = 136;\nconst MORPH_MIDPOINT_INTRUSION = (MORPH_START_INTRUSION + MORPH_FINAL_INTRUSION) / 2;\nconst MORPH_SNAP_EPSILON = 2;\nconst MORPH_SCROLL_SETTLE_MS = 160;\n''',
)
replace_once(
    morph,
    '    let signature = "";\n    let frame = 0;\n',
    '''    let signature = "";\n    let frame = 0;\n    let scrollSettleTimer = 0;\n    let snapReleaseTimer = 0;\n    let touchScrolling = false;\n    let snapInProgress = false;\n''',
)
replace_once(
    morph,
    '        const phase1 = clamp01((intrusion + 4) / 88);\n        const phase2 = sleep ? clamp01((intrusion - 34) / 102) : phase1;\n',
    '        const phase1 = clamp01((intrusion - MORPH_START_INTRUSION) / 88);\n        const phase2 = sleep ? clamp01((intrusion - 34) / (MORPH_FINAL_INTRUSION - 34)) : phase1;\n',
)
replace_once(
    morph,
    '''    const scheduleRefresh = () => {\n      if (frame) return;\n      frame = window.requestAnimationFrame(() => {\n        frame = 0;\n        refresh();\n      });\n    };\n\n    const observer = new MutationObserver(scheduleRefresh);\n''',
    '''    const scheduleRefresh = () => {\n      if (frame) return;\n      frame = window.requestAnimationFrame(() => {\n        frame = 0;\n        refresh();\n      });\n    };\n\n    const getCurrentMorphIntrusion = () => {\n      const stickyShell = document.querySelector<HTMLElement>(".twinly-baby-tabs > .sticky");\n      if (!stickyShell) return null;\n\n      const splitLayoutActive =\n        document.documentElement.dataset.twinlyLayout === "split" &&\n        window.matchMedia("(min-width: 1180px)").matches;\n      const group = getMorphGroups(splitLayoutActive).find((candidate) => {\n        const keys = new Set(candidate.sources.map((source) => source.key));\n        return keys.has("food") && keys.has("diaper") && keys.has("sleep");\n      });\n      if (!group) return null;\n\n      const food = group.sources.find((source) => source.key === "food");\n      if (!food) return null;\n      return stickyShell.getBoundingClientRect().bottom - food.button.getBoundingClientRect().top;\n    };\n\n    const settleMorphPosition = () => {\n      scrollSettleTimer = 0;\n      if (touchScrolling || snapInProgress) return;\n\n      const intrusion = getCurrentMorphIntrusion();\n      if (intrusion === null) return;\n      if (intrusion <= MORPH_START_INTRUSION + MORPH_SNAP_EPSILON) return;\n      if (intrusion >= MORPH_FINAL_INTRUSION - MORPH_SNAP_EPSILON) return;\n\n      const targetIntrusion = intrusion < MORPH_MIDPOINT_INTRUSION\n        ? MORPH_START_INTRUSION\n        : MORPH_FINAL_INTRUSION;\n      const delta = targetIntrusion - intrusion;\n      if (Math.abs(delta) < 1) return;\n\n      snapInProgress = true;\n      window.scrollBy({\n        top: delta,\n        left: 0,\n        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",\n      });\n\n      if (snapReleaseTimer) window.clearTimeout(snapReleaseTimer);\n      snapReleaseTimer = window.setTimeout(() => {\n        snapReleaseTimer = 0;\n        snapInProgress = false;\n        scheduleRefresh();\n      }, 420);\n    };\n\n    const scheduleMorphSnap = (delay = MORPH_SCROLL_SETTLE_MS) => {\n      if (touchScrolling || snapInProgress) return;\n      if (scrollSettleTimer) window.clearTimeout(scrollSettleTimer);\n      scrollSettleTimer = window.setTimeout(settleMorphPosition, delay);\n    };\n\n    const handleScroll = () => {\n      scheduleRefresh();\n      scheduleMorphSnap();\n    };\n\n    const handleTouchStart = () => {\n      touchScrolling = true;\n      if (scrollSettleTimer) {\n        window.clearTimeout(scrollSettleTimer);\n        scrollSettleTimer = 0;\n      }\n    };\n\n    const handleTouchEnd = () => {\n      touchScrolling = false;\n      scheduleMorphSnap(80);\n    };\n\n    const observer = new MutationObserver(scheduleRefresh);\n''',
)
replace_once(
    morph,
    '''    window.addEventListener("scroll", scheduleRefresh, { passive: true });\n    window.addEventListener("resize", scheduleRefresh, { passive: true });\n    scheduleRefresh();\n\n    return () => {\n      if (frame) window.cancelAnimationFrame(frame);\n      observer.disconnect();\n      window.removeEventListener("scroll", scheduleRefresh);\n      window.removeEventListener("resize", scheduleRefresh);\n''',
    '''    window.addEventListener("scroll", handleScroll, { passive: true });\n    window.addEventListener("resize", scheduleRefresh, { passive: true });\n    window.addEventListener("touchstart", handleTouchStart, { passive: true });\n    window.addEventListener("touchend", handleTouchEnd, { passive: true });\n    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });\n    scheduleRefresh();\n\n    return () => {\n      if (frame) window.cancelAnimationFrame(frame);\n      if (scrollSettleTimer) window.clearTimeout(scrollSettleTimer);\n      if (snapReleaseTimer) window.clearTimeout(snapReleaseTimer);\n      observer.disconnect();\n      window.removeEventListener("scroll", handleScroll);\n      window.removeEventListener("resize", scheduleRefresh);\n      window.removeEventListener("touchstart", handleTouchStart);\n      window.removeEventListener("touchend", handleTouchEnd);\n      window.removeEventListener("touchcancel", handleTouchEnd);\n''',
)

print("Applied tutorial exit confirmation and primary-action scroll snapping.")
