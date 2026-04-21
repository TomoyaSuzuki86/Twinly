import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditModal } from "./EditModal";
import { LogEvent } from "@/types";

describe("EditModal", () => {
  afterEach(() => {
    cleanup();
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

    render(<EditModal open onOpenChange={vi.fn()} event={event} onSave={vi.fn()} />);

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

    render(<EditModal open onOpenChange={vi.fn()} event={event} onSave={onSave} />);

    expect(screen.getByText("以前の「両方」記録です。保存する場合は「おしっこ」か「うんち」を選び直してください。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存する" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "おしっこ" }));

    expect(screen.getByRole("button", { name: "保存する" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(onSave).toHaveBeenCalledWith("diaper-mix", {
      diaperKind: "pee",
      note: "legacy",
    });
  });
});
