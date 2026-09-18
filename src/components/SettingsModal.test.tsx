import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsModal, shouldDisablePushEnable } from "./SettingsModal";
import { createInitialAppState } from "@/lib/app-state";

const renderSettings = (app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00")), premiumGaugesEnabled = false) =>
  render(
    <SettingsModal
      open
      onOpenChange={vi.fn()}
      app={app}
      premiumGaugesEnabled={premiumGaugesEnabled}
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

  it("hides the notifications tab for Free users", () => {
    renderSettings();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "プロフィール",
      "データ管理",
      "デザイン",
      "料金とプラン",
    ]);
    expect(screen.queryByRole("tab", { name: "通知" })).toBeNull();
    expect(screen.queryByText("Pixel Watch連携")).toBeNull();
    expect(screen.queryByRole("tab", { name: /Google Calendar/i })).toBeNull();
  });

  it("shows the care gauge and notifications tabs for Premium users", () => {
    renderSettings(undefined, true);
    expect(screen.getByRole("tab", { name: "お世話ゲージ" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "通知" })).toBeInTheDocument();
  });

  it("allows activity limits to be overridden and restored to the age default", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.activityLimitMinutesOverride = 120;
    renderSettings(app, true);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    expect(screen.getByText("2時間")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "活動可能時間を初期値に戻す" })[0]);
    expect(screen.getByText("初期値に戻しますか？")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getAllByText("月齢の目安").length).toBeGreaterThan(0);
  });

  it("allows daily sleep targets to be overridden and restored to the age default", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.sleepTargetHoursOverride = 14;
    renderSettings(app, true);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    expect(screen.getByText("14時間")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "必要睡眠時間を初期値に戻す" })[0]);
    expect(screen.getByText("初期値に戻しますか？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getAllByText("月齢の目安").length).toBeGreaterThan(0);
  });

  it("moves sleep management to data management and hides sleep gauge controls when disabled", () => {
    renderSettings(undefined, true);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "データ管理" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "睡眠管理を切り替え" }));

    expect(screen.getByRole("button", { name: "睡眠管理を切り替え" })).toHaveTextContent("オフ");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    expect(screen.getAllByText(/睡眠管理がオフです/).length).toBe(2);
    expect(screen.queryByRole("button", { name: /活動可能時間を10分/ })).toBeNull();
  });

  it("can copy one baby's gauge settings to the other baby", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.displayName = "A";
    app.profiles.B.displayName = "B";
    app.profiles.A.milkGaugeWindowHours = 4;
    renderSettings(app, true);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "Aのお世話ゲージ設定をBにも反映" }));

    expect(screen.getByText("✓ Bにも同じ設定を反映しました")).toBeInTheDocument();
  });

  it("keeps diaper stock management inside data management", () => {
    renderSettings();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "データ管理" }), { button: 0, ctrlKey: false });
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