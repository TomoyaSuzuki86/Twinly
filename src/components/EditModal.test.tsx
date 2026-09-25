import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditModal } from "./EditModal";
import { LogEvent } from "@/types";

describe("EditModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("edits breastfeeding without exposing a fake milk amount", () => {
    const onSave = vi.fn();
    const event: LogEvent = {
      id: "milk-legacy",
      babyId: "A",
      type: "milk",
      timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
      milkMl: 100,
      milkMethod: "breast",
      breastLeftMinutes: 15,
      breastRightMinutes: 0,
      note: "legacy",
    };

    render(<EditModal open onOpenChange={vi.fn()} event={event} onSave={onSave} onDelete={vi.fn()} />);

    expect(screen.getByText("母乳")).toBeTruthy();
    expect(screen.queryByLabelText("ミルク量")).toBeNull();
    expect(screen.queryByText(/母乳は量を持たず/)).toBeNull();
    expect((screen.getByLabelText("左の授乳時間") as HTMLSelectElement).value).toBe("15");
    expect((screen.getByLabelText("右の授乳時間") as HTMLSelectElement).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("option", { name: "なし" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith("milk-legacy", {
      milkMethod: "breast",
      breastLeftMinutes: 15,
      breastRightMinutes: 0,
      note: "legacy",
      timestamp: event.timestamp,
    });
  });

  it("does not offer mix when editing diaper records", () => {
    const event: LogEvent = {
      id: "diaper-1",
      babyId: "A",
      type: "diaper",
      timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
      diaperKind: "poop",
      note: "",
    };

    render(<EditModal open onOpenChange={vi.fn()} event={event} onSave={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole("button", { name: "おしっこ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "うんち" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "両方" })).toBeNull();
  });

  it("requires reselecting old mix diaper records before saving", () => {
    const onSave = vi.fn();
    const event: LogEvent = {
      id: "diaper-mix",
      babyId: "A",
      type: "diaper",
      timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
      diaperKind: "mix",
      note: "legacy",
    };

    render(<EditModal open onOpenChange={vi.fn()} event={event} onSave={onSave} onDelete={vi.fn()} />);

    expect(screen.getByText("以前の「両方」記録です。保存する場合は「おしっこ」か「うんち」を選び直してください。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存する" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "おしっこ" }));

    expect(screen.getByRole("button", { name: "保存する" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith("diaper-mix", {
      diaperKind: "pee",
      note: "legacy",
      timestamp: event.timestamp,
    });
  });

  it("changes the timestamp for any log type", () => {
    const onSave = vi.fn();
    const event: LogEvent = {
      id: "wake-1",
      babyId: "A",
      type: "wake",
      timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
      note: "起床",
    };

    render(<EditModal open onOpenChange={vi.fn()} event={event} onSave={onSave} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("日時"), { target: { value: "2026-04-18T09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith("wake-1", {
      note: "起床",
      timestamp: new Date("2026-04-18T09:30:00").getTime(),
    });
  });

  it("copies only custom memos to the other twin using the current edited values", () => {
    const onCopyCustomMemoToTwin = vi.fn(() => true);
    const event: LogEvent = {
      id: "custom-memo-1",
      babyId: "A",
      type: "daily",
      timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
      note: "沐浴",
      customMemoId: "bath",
      customMemoEmoji: "🛁",
    };

    render(
      <EditModal
        open
        onOpenChange={vi.fn()}
        event={event}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCopyCustomMemoToTwin={onCopyCustomMemoToTwin}
      />
    );

    fireEvent.change(screen.getByLabelText("日時"), { target: { value: "2026-04-18T09:30" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "朝の沐浴" } });
    fireEvent.click(screen.getByRole("button", { name: "もう片方にもコピー" }));

    expect(onCopyCustomMemoToTwin).toHaveBeenCalledWith(event, {
      note: "朝の沐浴",
      timestamp: new Date("2026-04-18T09:30:00").getTime(),
    });
    expect(screen.getByRole("button", { name: "コピー済み" }).hasAttribute("disabled")).toBe(true);
  });

  it("does not show the twin-copy action for an ordinary daily memo", () => {
    const event: LogEvent = {
      id: "daily-plain",
      babyId: "A",
      type: "daily",
      timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
      note: "普通のメモ",
    };

    render(
      <EditModal
        open
        onOpenChange={vi.fn()}
        event={event}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCopyCustomMemoToTwin={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "もう片方にもコピー" })).toBeNull();
  });

  it("requires confirmation before deleting a record", () => {
    const onDelete = vi.fn();
    const onOpenChange = vi.fn();
    const event: LogEvent = {
      id: "daily-1",
      babyId: "A",
      type: "daily",
      timestamp: new Date("2026-04-18T10:00:00+09:00").getTime(),
      note: "メモ",
    };

    render(
      <EditModal
        open
        onOpenChange={onOpenChange}
        event={event}
        onSave={vi.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("削除しますか？")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    expect(onDelete).toHaveBeenCalledWith("daily-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
