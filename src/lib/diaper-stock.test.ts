import { describe, expect, it } from "vitest";
import { createInitialAppState } from "@/lib/app-state";
import { estimateDiaperStockBySize } from "./diaper-stock";
import { LogEvent } from "@/types";

const now = new Date("2026-04-22T09:00:00+09:00");

const buildDiaperEvent = (id: string, babyId: "A" | "B", timestamp: string): LogEvent => ({
  id,
  babyId,
  type: "diaper",
  timestamp: new Date(timestamp).getTime(),
  diaperKind: "pee",
});

describe("estimateDiaperStockBySize", () => {
  it("直近7日間のおむつ記録から、同じサイズを使う赤ちゃんの1日平均使用枚数を計算する", () => {
    const app = createInitialAppState(now);
    app.profiles.A.diaperSize = "S";
    app.profiles.B.diaperSize = "S";
    app.profiles.A.diaperStockBySize.S = 14;
    app.profiles.B.diaperStockBySize.S = 14;

    const events: LogEvent[] = [
      buildDiaperEvent("a-1", "A", "2026-04-21T09:00:00+09:00"),
      buildDiaperEvent("a-2", "A", "2026-04-20T09:00:00+09:00"),
      buildDiaperEvent("a-3", "A", "2026-04-19T09:00:00+09:00"),
      buildDiaperEvent("b-1", "B", "2026-04-18T09:00:00+09:00"),
      buildDiaperEvent("b-2", "B", "2026-04-17T09:00:00+09:00"),
      buildDiaperEvent("b-3", "B", "2026-04-16T09:00:00+09:00"),
      {
        id: "milk-1",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-21T10:00:00+09:00").getTime(),
        milkMl: 120,
        milkMethod: "bottle",
      },
    ];

    const result = estimateDiaperStockBySize({
      profiles: app.profiles,
      events,
      size: "S",
      now,
    });

    expect(result.remaining).toBe(14);
    expect(result.dailyAverage).toBeCloseTo(6 / 7);
    expect(result.daysRemaining).toBeCloseTo(14 / (6 / 7));
    expect(result.estimatedRunOutDate).toBe("2026-05-09");
    expect(result.level).toBe("none");
  });

  it("対象サイズを使っていない赤ちゃんのおむつ記録は予測計算から除外する", () => {
    const app = createInitialAppState(now);
    app.profiles.A.diaperSize = "S";
    app.profiles.B.diaperSize = "M";
    app.profiles.A.diaperStockBySize.S = 6;
    app.profiles.B.diaperStockBySize.S = 6;

    const events: LogEvent[] = [
      buildDiaperEvent("a-1", "A", "2026-04-21T09:00:00+09:00"),
      buildDiaperEvent("a-2", "A", "2026-04-20T09:00:00+09:00"),
      buildDiaperEvent("a-3", "A", "2026-04-19T09:00:00+09:00"),
      buildDiaperEvent("b-1", "B", "2026-04-21T09:00:00+09:00"),
      buildDiaperEvent("b-2", "B", "2026-04-20T09:00:00+09:00"),
      buildDiaperEvent("b-3", "B", "2026-04-19T09:00:00+09:00"),
    ];

    const result = estimateDiaperStockBySize({
      profiles: app.profiles,
      events,
      size: "S",
      now,
    });

    expect(result.dailyAverage).toBeCloseTo(3 / 7);
    expect(result.daysRemaining).toBeCloseTo(14);
    expect(result.estimatedRunOutDate).toBe("2026-05-06");
  });

  it("記録が3件未満の場合は unknown を返し、在庫切れ日を出さない", () => {
    const app = createInitialAppState(now);
    app.profiles.A.diaperSize = "S";
    app.profiles.B.diaperSize = "S";
    app.profiles.A.diaperStockBySize.S = 12;
    app.profiles.B.diaperStockBySize.S = 12;

    const result = estimateDiaperStockBySize({
      profiles: app.profiles,
      events: [
        buildDiaperEvent("a-1", "A", "2026-04-21T09:00:00+09:00"),
        buildDiaperEvent("b-1", "B", "2026-04-20T09:00:00+09:00"),
      ],
      size: "S",
      now,
    });

    expect(result.dailyAverage).toBe(0);
    expect(result.daysRemaining).toBeNull();
    expect(result.estimatedRunOutDate).toBeNull();
    expect(result.level).toBe("unknown");
  });

  it("在庫が0枚以下の場合は urgent を返し、在庫切れ日は当日になる", () => {
    const app = createInitialAppState(now);
    app.profiles.A.diaperSize = "S";
    app.profiles.B.diaperSize = "S";
    app.profiles.A.diaperStockBySize.S = 0;
    app.profiles.B.diaperStockBySize.S = 0;

    const result = estimateDiaperStockBySize({
      profiles: app.profiles,
      events: [],
      size: "S",
      now,
    });

    expect(result.remaining).toBe(0);
    expect(result.daysRemaining).toBe(0);
    expect(result.estimatedRunOutDate).toBe("2026-04-22");
    expect(result.level).toBe("urgent");
  });

  it("残り日数に応じて urgent、warning、caution を切り替える", () => {
    const app = createInitialAppState(now);
    app.profiles.A.diaperSize = "S";
    app.profiles.B.diaperSize = "S";

    const events: LogEvent[] = [
      buildDiaperEvent("a-1", "A", "2026-04-21T09:00:00+09:00"),
      buildDiaperEvent("a-2", "A", "2026-04-20T09:00:00+09:00"),
      buildDiaperEvent("a-3", "A", "2026-04-19T09:00:00+09:00"),
      buildDiaperEvent("a-4", "A", "2026-04-18T09:00:00+09:00"),
      buildDiaperEvent("a-5", "A", "2026-04-17T09:00:00+09:00"),
      buildDiaperEvent("a-6", "A", "2026-04-16T09:00:00+09:00"),
      buildDiaperEvent("a-7", "A", "2026-04-15T09:00:00+09:00"),
    ];

    app.profiles.A.diaperStockBySize.S = 1;
    app.profiles.B.diaperStockBySize.S = 1;
    expect(
      estimateDiaperStockBySize({ profiles: app.profiles, events, size: "S", now }).level
    ).toBe("urgent");

    app.profiles.A.diaperStockBySize.S = 3;
    app.profiles.B.diaperStockBySize.S = 3;
    expect(
      estimateDiaperStockBySize({ profiles: app.profiles, events, size: "S", now }).level
    ).toBe("warning");

    app.profiles.A.diaperStockBySize.S = 7;
    app.profiles.B.diaperStockBySize.S = 7;
    expect(
      estimateDiaperStockBySize({ profiles: app.profiles, events, size: "S", now }).level
    ).toBe("caution");
  });
});
