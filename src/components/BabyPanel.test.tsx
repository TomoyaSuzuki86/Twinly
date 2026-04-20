import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BabyPanel } from "./BabyPanel";
import { createInitialAppState } from "@/lib/app-state";
import { LogEvent } from "@/types";

describe("BabyPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("shows the last milk and diaper times together with elapsed minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:20:00+09:00"));

    const app = createInitialAppState(new Date("2026-04-18T10:20:00+09:00"));
    const events: LogEvent[] = [
      {
        id: "milk-1",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T09:45:00+09:00").getTime(),
        milkMl: 80,
        milkMethod: "bottle",
      },
      {
        id: "diaper-1",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T10:05:00+09:00").getTime(),
        diaperKind: "pee",
      },
    ];

    render(
      <BabyPanel
        profile={app.profiles.A}
        events={events}
        lowStock={null}
        onOpenHistory={vi.fn()}
        onOpenModal={vi.fn()}
        onDeleteEvent={vi.fn()}
        onAddEvent={vi.fn()}
        lastWeight={null}
        lastHeight={null}
        themeDimmedBgColor="bg-background"
      />
    );

    expect(screen.getByText("前回 09:45")).toBeTruthy();
    expect(screen.getByText("35分経過")).toBeTruthy();
    expect(
      screen.getByText((_, element) => element?.textContent === "前回 10:05 / 15分経過")
    ).toBeTruthy();
  });

  it("renders every event instead of limiting the list to four items", () => {
    const app = createInitialAppState(new Date("2026-04-18T10:20:00+09:00"));
    const events: LogEvent[] = Array.from({ length: 6 }, (_, index) => ({
      id: `milk-${index + 1}`,
      babyId: "A",
      type: "milk",
      timestamp: new Date(`2026-04-18T0${index}:00:00+09:00`).getTime(),
      milkMl: 100 + index,
      milkMethod: "bottle",
      note: `event-${index + 1}`,
    }));

    render(
      <BabyPanel
        profile={app.profiles.A}
        events={events}
        lowStock={null}
        onOpenHistory={vi.fn()}
        onOpenModal={vi.fn()}
        onDeleteEvent={vi.fn()}
        onAddEvent={vi.fn()}
        lastWeight={null}
        lastHeight={null}
        themeDimmedBgColor="bg-background"
      />
    );

    expect(screen.getByText("event-1")).toBeTruthy();
    expect(screen.getByText("event-6")).toBeTruthy();
    expect(screen.getAllByText(/event-/)).toHaveLength(6);
  });

  it("opens the corresponding history view from each summary card", () => {
    const app = createInitialAppState(new Date("2026-04-18T10:20:00+09:00"));
    const onOpenHistory = vi.fn();

    render(
      <BabyPanel
        profile={app.profiles.A}
        events={[]}
        lowStock={null}
        onOpenHistory={onOpenHistory}
        onOpenModal={vi.fn()}
        onDeleteEvent={vi.fn()}
        onAddEvent={vi.fn()}
        lastWeight={null}
        lastHeight={null}
        themeDimmedBgColor="bg-background"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "赤ちゃんAのミルク履歴を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "赤ちゃんAのおむつ履歴を開く" }));

    expect(onOpenHistory).toHaveBeenNthCalledWith(1, "milk", "A");
    expect(onOpenHistory).toHaveBeenNthCalledWith(2, "diaper", "A");
  });

  it("shows milk and diaper breakdown totals in the summary cards", () => {
    const app = createInitialAppState(new Date("2026-04-18T10:20:00+09:00"));
    const events: LogEvent[] = [
      {
        id: "milk-bottle",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T08:00:00+09:00").getTime(),
        milkMl: 120,
        milkMethod: "bottle",
      },
      {
        id: "milk-breast",
        babyId: "A",
        type: "milk",
        timestamp: new Date("2026-04-18T09:00:00+09:00").getTime(),
        milkMl: 80,
        milkMethod: "breast",
      },
      {
        id: "diaper-pee",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T09:30:00+09:00").getTime(),
        diaperKind: "pee",
      },
      {
        id: "diaper-mix",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
        diaperKind: "mix",
      },
      {
        id: "diaper-poop",
        babyId: "A",
        type: "diaper",
        timestamp: new Date("2026-04-18T10:10:00+09:00").getTime(),
        diaperKind: "poop",
      },
    ];

    render(
      <BabyPanel
        profile={app.profiles.A}
        events={events}
        lowStock={null}
        onOpenHistory={vi.fn()}
        onOpenModal={vi.fn()}
        onDeleteEvent={vi.fn()}
        onAddEvent={vi.fn()}
        lastWeight={null}
        lastHeight={null}
        themeDimmedBgColor="bg-background"
      />
    );

    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("120ml")).toBeTruthy();
    expect(screen.getByText("80ml")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getAllByText("2回")).toHaveLength(2);
  });
});
