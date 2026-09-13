from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src/lib/voice-command.ts"
content = PATH.read_text(encoding="utf-8")

old = '''  if (explicitTarget !== undefined && text.trim()) {
    return {
      ok: true,
      command: {
        kind: "event",
        babyId: targetBabyId,
        type: "daily",
        dailyNote: text.trim(),
        timestamp,
        note: `voice: ${text}`,
        fallbackMemo: true,
      },
    };
  }
'''
new = '''  if (explicitTarget === "both" && text.trim()) {
    return {
      ok: true,
      command: {
        kind: "event",
        babyId: targetBabyId,
        type: "daily",
        dailyNote: text.trim(),
        timestamp,
        note: `voice: ${text}`,
        fallbackMemo: true,
      },
    };
  }
'''
if content.count(old) != 1:
    raise RuntimeError(f"fallback memo block match count: {content.count(old)}")
content = content.replace(old, new, 1)

old = '''  const typedMatch = parsedResults.find(
    (result) => result.ok && !(result.command.type === "daily" && result.command.fallbackMemo)
  );
  if (typedMatch) return typedMatch;

  if (options.forcedBabyId === undefined) {
    const namedMatch = parsedResults.find(
      (result) => result.ok && result.command.babyId !== "both"
    );
    if (namedMatch) return namedMatch;
  }

  const anyMatch = parsedResults.find((result) => result.ok);
'''
new = '''  if (options.forcedBabyId === undefined) {
    const namedMatch = parsedResults.find(
      (result) =>
        result.ok &&
        result.command.babyId !== "both" &&
        !(result.command.type === "daily" && result.command.fallbackMemo)
    );
    if (namedMatch) return namedMatch;
  }

  const typedMatch = parsedResults.find(
    (result) => result.ok && !(result.command.type === "daily" && result.command.fallbackMemo)
  );
  if (typedMatch) return typedMatch;

  const anyMatch = parsedResults.find((result) => result.ok);
'''
if content.count(old) != 1:
    raise RuntimeError(f"alternative selection block match count: {content.count(old)}")
content = content.replace(old, new, 1)

PATH.write_text(content, encoding="utf-8")

# Keep the final feature branch clean; this file is only a one-shot CI migration helper.
Path(__file__).unlink()
print("Voice memo parser compatibility fix applied")
