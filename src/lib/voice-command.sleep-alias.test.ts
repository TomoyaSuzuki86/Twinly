import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "./voice-command";

describe("sleep voice aliases", () => {
  it("treats 睡眠 as a sleep-start command", () => {
    expect(
      parseVoiceCommand("睡眠", {
        forcedBabyId: "A",
        now: new Date("2026-09-09T22:45:00+09:00"),
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "A",
        type: "sleepStart",
      },
    });
  });

  it("keeps the spoken time when 睡眠 includes a relative time", () => {
    const now = new Date("2026-09-09T22:45:00+09:00");
    const result = parseVoiceCommand("10分前 睡眠", { forcedBabyId: "B", now });

    expect(result).toMatchObject({
      ok: true,
      command: {
        babyId: "B",
        type: "sleepStart",
      },
    });
    expect(result.ok && result.command.timestamp).toBe(new Date("2026-09-09T22:35:00+09:00").getTime());
  });
});
