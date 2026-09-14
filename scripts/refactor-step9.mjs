import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content);

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`STEP 9 codemod could not find: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`STEP 9 codemod found duplicate target: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceFirst(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`STEP 9 codemod could not find: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const anchorsPath = 'src/lib/tutorial-anchors.ts';
write(anchorsPath, `import { useCallback, useMemo, useRef, type RefCallback } from "react";
import type { BabyId } from "@/types";

export type TutorialAnchorKey =
  | "baby-tabs"
  | "header"
  | "settings"
  | \`baby-tab:\${BabyId}\`
  | \`primary:\${BabyId}:milk\`
  | \`primary:\${BabyId}:diaper\`
  | \`primary:\${BabyId}:sleep\`
  | \`logs:\${BabyId}\`
  | \`log-summary:\${BabyId}\`
  | \`timeline:\${BabyId}\`;

export type TutorialAnchorRefFactory = (key: TutorialAnchorKey) => RefCallback<HTMLElement>;

export type TutorialAnchorRegistry = {
  ref: TutorialAnchorRefFactory;
  get: (key: TutorialAnchorKey) => HTMLElement | null;
};

export const EMPTY_TUTORIAL_ANCHORS: TutorialAnchorRegistry = {
  ref: () => () => undefined,
  get: () => null,
};

export const resolveTutorialTargetKeys = (step: number, activeBabyId: BabyId): TutorialAnchorKey[] => {
  switch (step) {
    case 0:
      return ["baby-tabs"];
    case 1:
      return [
        \`primary:\${activeBabyId}:milk\`,
        \`primary:\${activeBabyId}:diaper\`,
        \`primary:\${activeBabyId}:sleep\`,
      ];
    case 4:
      return ["baby-tab:A"];
    case 5:
    case 6:
      return ["header"];
    case 7:
      return [\`logs:\${activeBabyId}\`];
    case 8:
      return [\`log-summary:\${activeBabyId}\`];
    case 9:
      return [\`timeline:\${activeBabyId}\`];
    case 11:
      return ["settings"];
    default:
      return [];
  }
};

export function useTutorialAnchors(): TutorialAnchorRegistry {
  const nodesRef = useRef(new Map<TutorialAnchorKey, HTMLElement>());
  const callbacksRef = useRef(new Map<TutorialAnchorKey, RefCallback<HTMLElement>>());

  const ref = useCallback<TutorialAnchorRefFactory>((key) => {
    const existing = callbacksRef.current.get(key);
    if (existing) return existing;

    const callback: RefCallback<HTMLElement> = (node) => {
      if (node) nodesRef.current.set(key, node);
      else nodesRef.current.delete(key);
    };
    callbacksRef.current.set(key, callback);
    return callback;
  }, []);

  const get = useCallback((key: TutorialAnchorKey) => nodesRef.current.get(key) ?? null, []);
  return useMemo(() => ({ ref, get }), [get, ref]);
}
`);

const anchorsTestPath = 'src/lib/tutorial-anchors.test.tsx';
write(anchorsTestPath, `import { useEffect } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveTutorialTargetKeys,
  useTutorialAnchors,
  type TutorialAnchorRegistry,
} from "./tutorial-anchors";

afterEach(cleanup);

describe("tutorial anchors", () => {
  it("maps tutorial steps to explicit semantic anchors", () => {
    expect(resolveTutorialTargetKeys(0, "B")).toEqual(["baby-tabs"]);
    expect(resolveTutorialTargetKeys(1, "B")).toEqual([
      "primary:B:milk",
      "primary:B:diaper",
      "primary:B:sleep",
    ]);
    expect(resolveTutorialTargetKeys(8, "B")).toEqual(["log-summary:B"]);
    expect(resolveTutorialTargetKeys(11, "B")).toEqual(["settings"]);
    expect(resolveTutorialTargetKeys(10, "B")).toEqual([]);
  });

  it("registers elements without querying the document", () => {
    let registry: TutorialAnchorRegistry | null = null;
    const Harness = () => {
      const anchors = useTutorialAnchors();
      useEffect(() => { registry = anchors; }, [anchors]);
      return <button ref={anchors.ref("settings")}>設定</button>;
    };

    render(<Harness />);
    const button = screen.getByRole("button", { name: "設定" });
    expect(registry?.get("settings")).toBe(button);
  });
});
`);

let tutorial = read('src/components/IntroTutorial.tsx');
tutorial = replaceOnce(
  tutorial,
  'import type { LogEvent } from "@/types";\n',
  'import type { BabyId, LogEvent } from "@/types";\nimport { EMPTY_TUTORIAL_ANCHORS, resolveTutorialTargetKeys, type TutorialAnchorRegistry } from "@/lib/tutorial-anchors";\n',
  'IntroTutorial imports'
);
tutorial = replaceOnce(
  tutorial,
  '  names: [string, string];\n};',
  '  names: [string, string];\n  anchors?: TutorialAnchorRegistry;\n  activeBabyId?: BabyId;\n  onOpenSettings?: () => void;\n};',
  'IntroTutorial props'
);
const resolverStart = tutorial.indexOf('const activePanel = () =>');
const resolverEnd = tutorial.indexOf('const tutorialSteps =', resolverStart);
if (resolverStart < 0 || resolverEnd < 0) throw new Error('STEP 9 could not find legacy tutorial target resolvers');
tutorial = tutorial.slice(0, resolverStart) + tutorial.slice(resolverEnd);
tutorial = replaceOnce(
  tutorial,
  'export function IntroTutorial({ uid, ready, blocked, replay, names }: Props) {',
  'export function IntroTutorial({ uid, ready, blocked, replay, names, anchors = EMPTY_TUTORIAL_ANCHORS, activeBabyId = "A", onOpenSettings }: Props) {',
  'IntroTutorial signature'
);
const oldMeasure = `    const measure = () => {
      const target = targetResolvers[step]?.();
      if (scrollTargetIntoView.has(step)) {
        target?.scrollIntoView?.({ block: "center", behavior: "instant" });
      } else if (step !== 2 && step !== 3) {
        window.scrollTo({ top: 0, behavior: "instant" });
      }

      const box = target?.getBoundingClientRect();
      if (!box || !box.width || !box.height) {
        setRect(null);
        setExtraRects([]);
        return;
      }

      const toRect = (targetBox: DOMRect): Rect => {
        const left = Math.max(8, targetBox.left - 4);
        const top = Math.max(8, targetBox.top - 4);
        return {
          top,
          left,
          width: Math.min(targetBox.width + 8, window.innerWidth - left - 8),
          height: targetBox.height + 8,
        };
      };

      setRect(toRect(box));
      if (step === 1) {
        const actionTargets = Array.from(activePanel()?.querySelectorAll<HTMLElement>('[data-tutorial="primary-action"]') ?? []);
        setExtraRects(actionTargets.slice(1).map((action) => toRect(action.getBoundingClientRect())));
      } else {
        setExtraRects([]);
      }
    };`;
const newMeasure = `    const measure = () => {
      const targetKeys = resolveTutorialTargetKeys(step, activeBabyId);
      const target = targetKeys.length ? anchors.get(targetKeys[0]) : null;
      if (scrollTargetIntoView.has(step)) {
        target?.scrollIntoView?.({ block: "center", behavior: "instant" });
      } else if (step !== 2 && step !== 3) {
        window.scrollTo({ top: 0, behavior: "instant" });
      }

      const box = target?.getBoundingClientRect();
      if (!box || !box.width || !box.height) {
        setRect(null);
        setExtraRects([]);
        return;
      }

      const toRect = (targetBox: DOMRect): Rect => {
        const left = Math.max(8, targetBox.left - 4);
        const top = Math.max(8, targetBox.top - 4);
        return {
          top,
          left,
          width: Math.min(targetBox.width + 8, window.innerWidth - left - 8),
          height: targetBox.height + 8,
        };
      };

      setRect(toRect(box));
      setExtraRects(
        targetKeys
          .slice(1)
          .map((key) => anchors.get(key))
          .filter((node): node is HTMLElement => Boolean(node))
          .map((node) => toRect(node.getBoundingClientRect()))
      );
    };`;
tutorial = replaceOnce(tutorial, oldMeasure, newMeasure, 'IntroTutorial measure');
tutorial = replaceOnce(
  tutorial,
  '  }, [open, step, sleepModalOpen, fakeEditOpen]);',
  '  }, [open, step, sleepModalOpen, fakeEditOpen, anchors, activeBabyId]);',
  'IntroTutorial measure dependencies'
);
tutorial = replaceOnce(
  tutorial,
  `  const completeAndOpenSettings = () => {
    const settingsButton = targetResolvers[11]?.();
    finish("completed", () => {
      window.setTimeout(() => settingsButton?.click(), 0);
    });
  };`,
  `  const completeAndOpenSettings = () => {
    finish("completed", () => {
      window.setTimeout(() => onOpenSettings?.(), 0);
    });
  };`,
  'IntroTutorial settings action'
);
write('src/components/IntroTutorial.tsx', tutorial);

let header = read('src/components/HeaderOverflowMenu.tsx');
header = replaceOnce(
  header,
  'import { useEffect, useRef, useState } from "react";',
  'import { useEffect, useRef, useState, type Ref } from "react";',
  'HeaderOverflowMenu Ref import'
);
header = replaceOnce(
  header,
  '  onOpenSettings: () => void;\n};',
  '  onOpenSettings: () => void;\n  tutorialAnchorRef?: Ref<HTMLButtonElement>;\n};',
  'HeaderOverflowMenu props'
);
header = replaceOnce(
  header,
  'export function HeaderOverflowMenu({ access, onOpenHelp, onOpenSettings }: HeaderOverflowMenuProps) {',
  'export function HeaderOverflowMenu({ access, onOpenHelp, onOpenSettings, tutorialAnchorRef }: HeaderOverflowMenuProps) {',
  'HeaderOverflowMenu signature'
);
header = replaceOnce(
  header,
  '      <Button\n        variant="ghost"\n        size="icon"\n        type="button"\n        aria-label="メニュー"',
  '      <Button\n        ref={tutorialAnchorRef}\n        variant="ghost"\n        size="icon"\n        type="button"\n        aria-label="メニュー"',
  'HeaderOverflowMenu anchor'
);
write('src/components/HeaderOverflowMenu.tsx', header);

let panel = read('src/components/BabyPanel.tsx');
panel = replaceOnce(
  panel,
  'import { fmtTime, minutesSince } from "@/lib/utils";\n',
  'import { fmtTime, minutesSince } from "@/lib/utils";\nimport type { TutorialAnchorRefFactory } from "@/lib/tutorial-anchors";\n',
  'BabyPanel tutorial import'
);
panel = replaceOnce(
  panel,
  '  memberNameByUid?: Record<string, string>;\n};',
  '  memberNameByUid?: Record<string, string>;\n  tutorialAnchorRef?: TutorialAnchorRefFactory;\n};',
  'BabyPanel tutorial prop'
);
panel = replaceOnce(
  panel,
  '  memberNameByUid = {},\n}: BabyPanelProps) {',
  '  memberNameByUid = {},\n  tutorialAnchorRef,\n}: BabyPanelProps) {',
  'BabyPanel tutorial destructure'
);
panel = replaceFirst(panel, '            data-tutorial="primary-action"', '            ref={tutorialAnchorRef?.(`primary:${babyId}:milk`)}', 'milk anchor');
panel = replaceFirst(panel, '            data-tutorial="primary-action"', '            ref={tutorialAnchorRef?.(`primary:${babyId}:diaper`)}', 'diaper anchor');
panel = replaceFirst(panel, '          data-tutorial="primary-action"', '          ref={tutorialAnchorRef?.(`primary:${babyId}:sleep`)}', 'sleep anchor');
panel = replaceOnce(
  panel,
  '          <h3 data-tutorial="logs" className="text-sm font-semibold text-muted-foreground">ログ</h3>',
  '          <h3 ref={tutorialAnchorRef?.(`logs:${babyId}`)} className="text-sm font-semibold text-muted-foreground">ログ</h3>',
  'logs anchor'
);
panel = replaceOnce(
  panel,
  '          <Button\n            variant="outline"\n            size="sm"\n            className="h-8"\n            onClick={onOpenTimeline}',
  '          <Button\n            ref={tutorialAnchorRef?.(`timeline:${babyId}`)}\n            variant="outline"\n            size="sm"\n            className="h-8"\n            onClick={onOpenTimeline}',
  'timeline anchor'
);
panel = replaceOnce(
  panel,
  '        <div\n          data-tutorial="log-summary"\n          className="-mx-1 overflow-x-auto px-1 pb-2"',
  '        <div\n          ref={tutorialAnchorRef?.(`log-summary:${babyId}`)}\n          className="-mx-1 overflow-x-auto px-1 pb-2"',
  'log summary anchor'
);
write('src/components/BabyPanel.tsx', panel);

let app = read('src/App.tsx');
app = replaceOnce(
  app,
  'import { useWearPairing } from "./lib/use-wear-pairing";\n',
  'import { useWearPairing } from "./lib/use-wear-pairing";\nimport { useTutorialAnchors } from "./lib/tutorial-anchors";\n',
  'App tutorial import'
);
app = replaceOnce(
  app,
  '  const comfortHeaderState = useComfortHeaderState();\n',
  '  const comfortHeaderState = useComfortHeaderState();\n  const tutorialAnchors = useTutorialAnchors();\n',
  'App tutorial registry'
);
app = replaceOnce(app, '                data-tutorial="header"', '                ref={tutorialAnchors.ref("header")}', 'App header anchor');
app = replaceOnce(app, '                data-tutorial="babies"', '                ref={tutorialAnchors.ref("baby-tabs")}', 'App tabs anchor');
app = replaceOnce(app, '                  data-tutorial="baby-A"', '                  ref={tutorialAnchors.ref("baby-tab:A")}', 'App baby A anchor');
app = replaceOnce(
  app,
  '                <TabsTrigger\n                  value="B"',
  '                <TabsTrigger\n                  ref={tutorialAnchors.ref("baby-tab:B")}\n                  value="B"',
  'App baby B anchor'
);
app = replaceOnce(
  app,
  '                  <HeaderOverflowMenu\n                    access={familyAccess}',
  '                  <HeaderOverflowMenu\n                    tutorialAnchorRef={tutorialAnchors.ref("settings")}\n                    access={familyAccess}',
  'App settings anchor'
);
const panelProfileA = '              <BabyPanel\n                profile={app.profiles.A}';
app = replaceOnce(app, panelProfileA, '              <BabyPanel\n                tutorialAnchorRef={tutorialAnchors.ref}\n                profile={app.profiles.A}', 'App BabyPanel A anchors');
const panelProfileB = '              <BabyPanel\n                profile={app.profiles.B}';
app = replaceOnce(app, panelProfileB, '              <BabyPanel\n                tutorialAnchorRef={tutorialAnchors.ref}\n                profile={app.profiles.B}', 'App BabyPanel B anchors');
app = replaceOnce(
  app,
  '        names={[app.profiles.A.displayName, app.profiles.B.displayName]}\n      />',
  '        names={[app.profiles.A.displayName, app.profiles.B.displayName]}\n        anchors={tutorialAnchors}\n        activeBabyId={selectedBabyTab}\n        onOpenSettings={() => handleOpenModal("settings")}\n      />',
  'App IntroTutorial anchors'
);
write('src/App.tsx', app);

for (const path of ['src/components/IntroTutorial.tsx', 'src/App.tsx', 'src/components/BabyPanel.tsx']) {
  const content = read(path);
  if (path.endsWith('IntroTutorial.tsx') && /querySelector/.test(content)) {
    throw new Error('IntroTutorial still contains querySelector after STEP 9');
  }
}

console.log('STEP 9 tutorial anchor refactor applied');
