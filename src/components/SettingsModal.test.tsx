import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsModal, shouldDisablePushEnable } from "./SettingsModal";
import { createInitialAppState } from "@/lib/app-state";

const renderSettings = (app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"))) =>
  render(
    <SettingsModal
      open
      onOpenChange={vi.fn()}
      app={app}
      setApp={vi.fn()}
      user={null}
      onSignIn={vi.fn()}
      onSignOut={vi.fn()}
      pushPermission="unsupported"
      pushSubscribed={false}
      pushBusy={false}
      webPushConfigured={false}
      onEnablePushNotifications={vi.fn()}
      onDisablePushNotifications={vi.fn()}
      wearPairingToken={null}
      wearPairingBusy={false}
      onCreateWearPairingToken={vi.fn()}
      onExport={vi.fn()}
      onImport={vi.fn()}
      onResetAll={vi.fn()}
    />
  );

describe("SettingsModal", () => {
  afterEach(cleanup);

  it("organizes settings into profile, notifications, data, design and pricing tabs", () => {
    renderSettings();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "プロフィール",
      "通知",
      "データ管理",
      "デザイン",
      "料金とプラン",
    ]);
    expect(screen.queryByText("Pixel Watch連携")).toBeNull();
    expect(screen.queryByRole("tab", { name: /Google Calendar/i })).toBeNull();
  });

  it("allows activity limits to be overridden and restored to the age default", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.activityLimitMinutesOverride = 120;
    renderSettings(app);

    const activityLimitInputs = screen.getAllByLabelText("活動可能時間") as HTMLInputElement[];
    expect(activityLimitInputs[0].value).toBe("120");

    fireEvent.click(screen.getAllByRole("button", { name: "活動可能時間を初期値に戻す" })[0]);
    expect(screen.getByText("初期値に戻しますか？")).toBeTruthy();
    expect(activityLimitInputs[0].value).toBe("120");

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(activityLimitInputs[0].value).toBe("");
  });

  it("allows daily sleep targets to be overridden and restored to the age default", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.sleepTargetHoursOverride = 14;
    renderSettings(app);

    const sleepTargetInputs = screen.getAllByLabelText("1日の必要睡眠時間") as HTMLInputElement[];
    expect(sleepTargetInputs[0].value).toBe("14");

    fireEvent.click(screen.getAllByRole("button", { name: "必要睡眠時間を初期値に戻す" })[0]);
    expect(screen.getByText("初期値に戻しますか？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(sleepTargetInputs[0].value).toBe("");
  });

  it("moves sleep management to data management and hides sleep profile settings when disabled", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: "データ管理" }));
    fireEvent.click(screen.getByRole("button", { name: "睡眠管理を切り替え" }));

    expect(screen.getByRole("button", { name: "睡眠管理を切り替え" })).toHaveTextContent("オフ");
    expect(screen.queryByLabelText("活動可能時間")).toBeNull();
    expect(screen.queryByLabelText("1日の必要睡眠時間")).toBeNull();
  });

  it("keeps diaper stock management inside data management", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: "データ管理" }));
    expect(screen.getByRole("button", { name: "おむつ在庫管理を切り替え" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "おむつ在庫" })).toBeNull();
  });

  it("allows retrying push subscription when permission is already granted", () => {
    expect(shouldDisablePushEnable(false, false, true)).toBe(false);
    expect(shouldDisablePushEnable(false, true, true)).toBe(true);
    expect(shouldDisablePushEnable(true, false, true)).toBe(true);
    expect(shouldDisablePushEnable(false, false, false)).toBe(true);
  });

  it("always renders baby A before baby B even when profile keys arrive in reverse order", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles = { B: app.profiles.B, A: app.profiles.A };
    renderSettings(app);

    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "赤ちゃん A",
      "赤ちゃん B",
    ]);
  });
});
