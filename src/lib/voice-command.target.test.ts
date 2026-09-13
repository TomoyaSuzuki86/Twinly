import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "./voice-command";

const now = new Date("2026-09-13T15:00:00+09:00");

describe("voice command target ownership", () => {
  it("does not reroute a forced baby command when another baby's name is spoken", () => {
    expect(
      parseVoiceCommand("日向 ミルク180", {
        babyNames: { A: ["奏汰", "かなた"], B: ["日向", "ひなた"] },
        forcedBabyId: "A",
        now,
      })
    ).toMatchObject({
      ok: true,
      command: { babyId: "A", type: "milk", milkMl: 180 },
    });
  });

  it("keeps a spoken baby name in a plain header memo and targets both", () => {
    expect(
      parseVoiceCommand("奏汰 今日はお出かけに行ってきました", {
        babyNames: { A: ["奏汰", "かなた"], B: ["日向", "ひなた"] },
        forcedBabyId: "both",
        now,
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "both",
        type: "daily",
        dailyNote: "奏汰 今日はお出かけに行ってきました",
        fallbackMemo: true,
      },
    });
  });

  it("preserves text before the memo keyword for explicitly targeted common memos", () => {
    expect(
      parseVoiceCommand("日向 メモ 今日はよく笑った", {
        babyNames: { A: ["奏汰"], B: ["日向"] },
        forcedBabyId: "both",
        now,
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "both",
        type: "daily",
        dailyNote: "日向 今日はよく笑った",
      },
    });
  });
});
