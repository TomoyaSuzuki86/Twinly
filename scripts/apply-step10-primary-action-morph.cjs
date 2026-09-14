const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`STEP 10 could not find: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`STEP 10 found duplicate target: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const support = read("scripts/step10-baby-panel-support.txt");
const actions = read("scripts/step10-baby-panel-actions.txt");

let panel = read("src/components/BabyPanel.tsx");
panel = replaceOnce(
  panel,
  'import { ReactNode, useEffect, useRef, useState } from "react";',
  'import { ReactNode, type Ref, useEffect, useRef, useState } from "react";',
  "BabyPanel React import"
);
panel = replaceOnce(
  panel,
  'import type { TutorialAnchorRefFactory } from "@/lib/tutorial-anchors";\n',
  'import type { TutorialAnchorRefFactory } from "@/lib/tutorial-anchors";\nimport type { LayoutMode } from "@/lib/appearance-preferences";\nimport { PrimaryActionMorph } from "./PrimaryActionMorph";\n',
  "BabyPanel morph imports"
);
panel = replaceOnce(
  panel,
  '  memberNameByUid?: Record<string, string>;\n  tutorialAnchorRef?: TutorialAnchorRefFactory;\n};',
  '  memberNameByUid?: Record<string, string>;\n  tutorialAnchorRef?: TutorialAnchorRefFactory;\n  primaryActionMorph?: {\n    stickyRef: { current: HTMLElement | null };\n    layoutMode: LayoutMode;\n    selected: boolean;\n    primaryInSplit: boolean;\n  };\n};',
  "BabyPanel morph prop"
);
panel = replaceOnce(
  panel,
  '  memberNameByUid = {},\n  tutorialAnchorRef,\n}: BabyPanelProps) {',
  '  memberNameByUid = {},\n  tutorialAnchorRef,\n  primaryActionMorph,\n}: BabyPanelProps) {',
  "BabyPanel morph destructure"
);
panel = replaceOnce(
  panel,
  '  useEffect(() => () => clearSleepLongPressTimer(), []);\n\n  return (',
  `  useEffect(() => () => clearSleepLongPressTimer(), []);\n\n${support}\n  return (`,
  "BabyPanel morph render support"
);
panel = replaceOnce(
  panel,
  '    <Card\n      className={`twinly-baby-panel flex flex-col border-border/60 ${themeDimmedBgColor} ${',
  '    <Card\n      ref={primaryActionBoundsRef}\n      className={`twinly-baby-panel flex flex-col border-border/60 ${themeDimmedBgColor} ${',
  "BabyPanel bounds ref"
);
const returnIndex = panel.indexOf("  return (");
const actionsStart = panel.indexOf('        <div className="grid grid-cols-2 gap-4">', returnIndex);
const actionsEndMarker = '        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">';
const actionsEnd = panel.indexOf(actionsEndMarker, actionsStart);
if (actionsStart < 0 || actionsEnd < 0) throw new Error("STEP 10 could not locate BabyPanel primary action region");
panel = panel.slice(0, actionsStart) + actions + panel.slice(actionsEnd);
write("src/components/BabyPanel.tsx", panel);

let app = read("src/App.tsx");
app = replaceOnce(
  app,
  '  const babyTabSwipeStartRef = useRef<SwipePoint | null>(null);\n  const lastKnownTodayRef = useRef(todayDate);',
  '  const babyTabSwipeStartRef = useRef<SwipePoint | null>(null);\n  const lastKnownTodayRef = useRef(todayDate);\n  const primaryActionStickyRef = useRef<HTMLDivElement | null>(null);',
  "App primary action sticky ref"
);
app = replaceOnce(
  app,
  '            <div className="sticky top-0 z-40 space-y-1 bg-background">',
  '            <div ref={primaryActionStickyRef} className="sticky top-0 z-40 space-y-1 bg-background">',
  "App sticky shell ref"
);
app = replaceOnce(
  app,
  '              <BabyPanel\n                tutorialAnchorRef={tutorialAnchors.ref}\n                profile={app.profiles.A}',
  '              <BabyPanel\n                tutorialAnchorRef={tutorialAnchors.ref}\n                primaryActionMorph={{\n                  stickyRef: primaryActionStickyRef,\n                  layoutMode,\n                  selected: selectedBabyTab === "A",\n                  primaryInSplit: true,\n                }}\n                profile={app.profiles.A}',
  "App baby A morph config"
);
app = replaceOnce(
  app,
  '              <BabyPanel\n                tutorialAnchorRef={tutorialAnchors.ref}\n                profile={app.profiles.B}',
  '              <BabyPanel\n                tutorialAnchorRef={tutorialAnchors.ref}\n                primaryActionMorph={{\n                  stickyRef: primaryActionStickyRef,\n                  layoutMode,\n                  selected: selectedBabyTab === "B",\n                  primaryInSplit: false,\n                }}\n                profile={app.profiles.B}',
  "App baby B morph config"
);
write("src/App.tsx", app);

let polish = read("src/theme-polish.css");
polish = polish.replace(
  "/* The visible compact buttons are morph clones; their percentage sits directly under the button and otherwise inherits the default button foreground. */",
  "/* The visible compact buttons are React-owned morph actions; their percentage sits directly under the button and otherwise inherits the default button foreground. */"
);
write("src/theme-polish.css", polish);

if (fs.existsSync("src/components/PrimaryActionMorphEnhancer.tsx")) {
  fs.unlinkSync("src/components/PrimaryActionMorphEnhancer.tsx");
}

for (const temporaryPath of [
  "scripts/step10-baby-panel-support.txt",
  "scripts/step10-baby-panel-actions.txt",
  "scripts/apply-step10-primary-action-morph.cjs",
  ".github/workflows/step10-primary-action-morph.yml",
]) {
  if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
}
