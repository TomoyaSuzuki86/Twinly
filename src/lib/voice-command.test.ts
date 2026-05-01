import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "./voice-command";

describe("parseVoiceCommand", () => {
  it("parses a milk command with ascii baby id and amount", () => {
    expect(parseVoiceCommand("A ミルク 80")).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "milk",
        milkMl: 80,
        milkMethod: "bottle",
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
});
