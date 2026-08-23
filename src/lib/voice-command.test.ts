import { describe, expect, it } from "vitest";
import { parseVoiceCommand, selectVoiceCommandFromAlternatives } from "./voice-command";

describe("parseVoiceCommand", () => {
  it("parses a milk command with ascii baby id and amount", () => {
    expect(parseVoiceCommand("A ミルク 80")).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 80,
      },
    });
  });

  it("parses full-width milk amounts", () => {
    expect(parseVoiceCommand("Ｂちゃん ミルク １２０ミリ")).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "milk",
        milkMl: 120,
      },
    });
  });

  it("parses diaper poop commands", () => {
    expect(parseVoiceCommand("B うんち")).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "diaper",
        diaperKind: "poop",
      },
    });
  });

  it("parses a solid food command and keeps the spoken details as its memo", () => {
    expect(
      parseVoiceCommand("奏汰 離乳食 10倍がゆ 小さじ2", {
        A: ["奏汰"],
        B: ["日向"],
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "solidFood",
        note: "奏汰 離乳食 10倍がゆ 小さじ2",
      },
    });
  });

  it.each([
    ["奏汰 入眠", "sleepStart"],
    ["奏汰 寝ました", "sleepStart"],
    ["奏汰 お休み", "sleepStart"],
    ["日向 起床", "wake"],
    ["日向 起きた", "wake"],
    ["日向 おはよう", "wake"],
  ] as const)("parses sleep command: %s", (transcript, type) => {
    expect(parseVoiceCommand(transcript, { A: ["奏汰"], B: ["日向"] })).toMatchObject({
      ok: true,
      command: { babyId: transcript.startsWith("奏汰") ? "A" : "B", type },
    });
  });

  it("parses unko as a poop diaper command", () => {
    expect(parseVoiceCommand("B うんこ")).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "diaper",
        diaperKind: "poop",
      },
    });
  });

  it("parses configured baby display names", () => {
    const babyNames = {
      A: ["奏汰"],
      B: ["日向"],
    };

    expect(parseVoiceCommand("奏汰 ミルク 90", babyNames)).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 90,
      },
    });
    expect(parseVoiceCommand("日向 うんち", babyNames)).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "diaper",
        diaperKind: "poop",
      },
    });
  });

  it("parses known readings for configured Japanese baby names", () => {
    const babyNames = {
      A: ["奏汰", "かなた"],
      B: ["日向", "ひなた"],
    };

    expect(parseVoiceCommand("ひなたが5分前にミルクを80ml飲みました", babyNames)).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "milk",
        milkMl: 80,
      },
    });
    expect(parseVoiceCommand("かなたが14時30分にうんちしました", babyNames)).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "diaper",
        diaperKind: "poop",
      },
    });
  });

  it("parses absolute Japanese time expressions", () => {
    const now = new Date("2026-04-27T16:00:00+09:00");
    const result = parseVoiceCommand("奏汰が14時30分にうんちしました", { A: ["奏汰"], B: ["日向"] }, now);

    expect(result).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "diaper",
        diaperKind: "poop",
      },
    });
    expect(result.ok && result.command.timestamp).toBe(new Date("2026-04-27T14:30:00+09:00").getTime());
  });

  it("parses relative Japanese time expressions", () => {
    const now = new Date("2026-04-27T16:00:00+09:00");
    const result = parseVoiceCommand("日向が5分前にミルクを80ml飲みました", { A: ["奏汰"], B: ["日向"] }, now);

    expect(result).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "milk",
        milkMl: 80,
      },
    });
    expect(result.ok && result.command.timestamp).toBe(new Date("2026-04-27T15:55:00+09:00").getTime());
  });

  it("uses the current time when no time expression is spoken", () => {
    const now = new Date("2026-04-27T16:00:00+09:00");
    const result = parseVoiceCommand("ひなた ミルク 80", { A: ["かなた"], B: ["ひなた"] }, now);

    expect(result).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "milk",
        milkMl: 80,
      },
    });
    expect(result.ok && result.command.timestamp).toBe(now.getTime());
  });

  it("targets both babies when no name is spoken", () => {
    const result = parseVoiceCommand("5分前にミルクを80ml飲みました", { A: ["かなた"], B: ["ひなた"] });

    expect(result).toMatchObject({
      ok: true,
      command: {
        babyId: "both",
        type: "milk",
        milkMl: 80,
      },
    });
  });

  it("asks for a milk amount when it is missing", () => {
    expect(parseVoiceCommand("A ミルク")).toMatchObject({
      ok: false,
      reason: "missingMilkAmount",
    });
  });

  it("uses the previous milk amount for a named baby when amount is missing", () => {
    expect(
      parseVoiceCommand("A ミルク", {
        babyNames: {},
        defaultMilkMlByBaby: { A: 90, B: 110 },
        now: new Date("2026-04-27T16:00:00+09:00"),
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 90,
      },
    });
  });

  it("uses the forced baby target when no baby name is spoken", () => {
    expect(
      parseVoiceCommand("milk 80", {
        forcedBabyId: "B",
        now: new Date("2026-04-27T16:00:00+09:00"),
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "milk",
        milkMl: 80,
      },
    });
  });

  it("lets a forced baby target override a spoken baby name", () => {
    expect(
      parseVoiceCommand("A milk 80", {
        forcedBabyId: "B",
        now: new Date("2026-04-27T16:00:00+09:00"),
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "milk",
        milkMl: 80,
      },
    });
  });

  it("does not treat an absolute time as a milk amount", () => {
    const now = new Date("2026-04-27T16:00:00+09:00");
    const result = parseVoiceCommand("A milk 20:30", {
      babyNames: {},
      defaultMilkMlByBaby: { A: 90 },
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 90,
      },
    });
    expect(result.ok && result.command.timestamp).toBe(new Date("2026-04-27T20:30:00+09:00").getTime());
  });

  it("does not treat a Japanese absolute time as a milk amount", () => {
    const now = new Date("2026-04-27T16:00:00+09:00");
    const result = parseVoiceCommand("A milk 20\u664230\u5206", {
      babyNames: {},
      defaultMilkMlByBaby: { A: 90 },
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 90,
      },
    });
    expect(result.ok && result.command.timestamp).toBe(new Date("2026-04-27T20:30:00+09:00").getTime());
  });

  it("parses kanji milk amounts", () => {
    expect(parseVoiceCommand("A milk \u516b\u5341")).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 80,
      },
    });

    expect(parseVoiceCommand("A milk \u767e\u4e8c\u5341\u30df\u30ea")).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 120,
      },
    });
  });

  it("does not treat a kanji absolute time as a milk amount", () => {
    const now = new Date("2026-04-27T16:00:00+09:00");
    const result = parseVoiceCommand("A milk \u4e8c\u5341\u6642\u4e09\u5341\u5206", {
      babyNames: {},
      defaultMilkMlByBaby: { A: 90 },
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 90,
      },
    });
  });

  it("uses each baby's previous milk amount when no baby name or amount is spoken", () => {
    expect(
      parseVoiceCommand("ミルク", {
        babyNames: {},
        defaultMilkMlByBaby: { A: 90, B: 110 },
        now: new Date("2026-04-27T16:00:00+09:00"),
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "both",
        type: "milk",
        milkMlByBaby: { A: 90, B: 110 },
      },
    });
  });
  it("parses a named daily note command", () => {
    expect(parseVoiceCommand("ひなた ひとこと よく寝た", { A: ["かなた"], B: ["ひなた"] })).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "daily",
        dailyNote: "よく寝た",
      },
    });
  });

  it("requires a baby name for daily note commands", () => {
    expect(parseVoiceCommand("メモ よく寝た", { A: ["かなた"], B: ["ひなた"] })).toMatchObject({
      ok: false,
      reason: "missingBaby",
    });
  });

  it("parses named temperature, weight, and height commands", () => {
    expect(parseVoiceCommand("ひなた 体温 36.5", { A: ["かなた"], B: ["ひなた"] })).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "temperature",
        temperature: 36.5,
      },
    });

    expect(parseVoiceCommand("かなた 体重 5.8", { A: ["かなた"], B: ["ひなた"] })).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "weight",
        weight: 5.8,
      },
    });

    expect(parseVoiceCommand("ひなた 慎重 62.3", { A: ["かなた"], B: ["ひなた"] })).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "height",
        height: 62.3,
      },
    });
  });

  it("requires a baby name for health measurement commands", () => {
    expect(parseVoiceCommand("体温 36.5", { A: ["かなた"], B: ["ひなた"] })).toMatchObject({
      ok: false,
      reason: "missingBaby",
    });
    expect(parseVoiceCommand("体重 5.8", { A: ["かなた"], B: ["ひなた"] })).toMatchObject({
      ok: false,
      reason: "missingBaby",
    });
    expect(parseVoiceCommand("身長 62.3", { A: ["かなた"], B: ["ひなた"] })).toMatchObject({
      ok: false,
      reason: "missingBaby",
    });
  });

  it("normalizes common kanji speech-recognition variants for baby names", () => {
    const babyNames = { A: ["かなた"], B: ["ひなた"] };

    expect(parseVoiceCommand("彼方 ミルク 80", babyNames)).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 80,
      },
    });

    expect(parseVoiceCommand("彼方 うんち", babyNames)).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "diaper",
        diaperKind: "poop",
      },
    });

    expect(parseVoiceCommand("日向 ミルク 90", babyNames)).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "milk",
        milkMl: 90,
      },
    });
  });

  it("prefers a named alternative over an earlier unnamed alternative", () => {
    expect(
      selectVoiceCommandFromAlternatives(["ミルク 80", "かなた ミルク 80"], {
        babyNames: { A: ["かなた"], B: ["ひなた"] },
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 80,
      },
    });
  });

  it("falls back to an unnamed alternative when no candidate has a clear baby name", () => {
    expect(
      selectVoiceCommandFromAlternatives(["ミルク 80"], {
        babyNames: { A: ["かなた"], B: ["ひなた"] },
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "both",
        type: "milk",
        milkMl: 80,
      },
    });
  });
});
