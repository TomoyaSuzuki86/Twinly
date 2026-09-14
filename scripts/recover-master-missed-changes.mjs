import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content);

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Recovery codemod could not find: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Recovery codemod found duplicate target: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

let reminders = read('functions/reminder-functions.js');
reminders = replaceOnce(
  reminders,
  `      if (devicesSnap.empty) continue;\n  \n      const settings = settingsSnap.exists ? settingsSnap.data() : {};`,
  `      if (devicesSnap.empty) continue;\n      if (!familyId) continue;\n\n      let access;\n      try {\n        access = await familyAccess(familyId);\n      } catch (error) {\n        logger.warn("Reminder access unavailable", { uid, familyId, message: error.message });\n        continue;\n      }\n      if (!access.features.careNotifications) continue;\n  \n      const settings = settingsSnap.exists ? settingsSnap.data() : {};`,
  'Premium care-notification gate'
);
reminders = replaceOnce(
  reminders,
  `      if (familyId && (await familyAccess(familyId)).features.stockNotifications) {`,
  `      if (access.features.stockNotifications) {`,
  'reuse resolved family access'
);
write('functions/reminder-functions.js', reminders);

let tutorial = read('src/components/IntroTutorial.tsx');
tutorial = replaceOnce(
  tutorial,
  `import { finishTutorial, shouldShowTutorial, type TutorialOutcome } from "@/lib/tutorial-progress";\n`,
  `import { finishTutorial, shouldShowTutorial, type TutorialOutcome } from "@/lib/tutorial-progress";\nimport { useBrowserBackDismiss } from "@/lib/use-browser-back-dismiss";\n`,
  'browser-back hook import'
);
const finishBlock = `  const finish = (outcome: TutorialOutcome, after?: () => void) => {\n    clearSleepLongPress();\n    clearVoiceLongPress();\n    clearSleepTransition();\n    setVoiceListening(false);\n    setExitConfirmOpen(false);\n    setOpen(false);\n    void finishTutorial(uid, outcome);\n    window.scrollTo({ top: 0, behavior: "instant" });\n    after?.();\n  };\n`;
tutorial = replaceOnce(
  tutorial,
  finishBlock,
  `${finishBlock}\n  useBrowserBackDismiss(open, () => finish("skipped"), { dismissOnAnyPopState: true });\n`,
  'tutorial browser-back dismissal'
);
write('src/components/IntroTutorial.tsx', tutorial);

console.log('Recovered master-only behavior onto the refactored development lineage.');
