import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsModal, shouldDisablePushEnable } from "./SettingsModal";
import { createInitialAppState } from "@/lib/app-state";

const renderSettings = (
  app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00")),
  premiumGaugesEnabled = false,
  setApp = vi.fn(),
  onOpenChange = vi.fn()
) =>
  render(
    <SettingsModal
      open
      onOpenChange={onOpenChange}
      app={app}
      premiumGaugesEnabled={premiumGaugesEnabled}
      setApp={setApp}
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

  it("lets Free users configure care gauges while keeping notifications Premium-only", () => {
    renderSettings();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "プロフィール",
      "お世話ゲージ",
      "データ管理",
      "デザイン",
      "料金とプラン",
    ]);
    expect(screen.queryByRole("tab", { name: "通知" })).toBeNull();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    expect(screen.getByText(/お世話ゲージはPremium専用機能です/)).toBeInTheDocument();
    expect(screen.getByText(/Freeでも設定は先に調整・保存でき/)).toBeInTheDocument();
  });

  it("uses the same dimmed baby theme backgrounds as the main screen", () => {
    renderSettings();

    expect(screen.getByTestId("profile-settings-A").className).toContain("bg-violet-900/60");
    expect(screen.getByTestId("profile-settings-B").className).toContain("bg-sky-900/60");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    expect(screen.getByTestId("care-gauge-settings-A").className).toContain("bg-violet-900/60");
    expect(screen.getByTestId("care-gauge-settings-B").className).toContain("bg-sky-900/60");
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
    expect(screen.getAllByText("2時間").length).toBeGreaterThan(0);

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

  it("restores the previous custom sleep values after temporarily switching to age defaults", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.activityLimitMinutesOverride = 130;
    app.profiles.A.sleepTargetHoursOverride = 14.5;
    renderSettings(app, false);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    expect(screen.getByText("2時間10分")).toBeInTheDocument();
    expect(screen.getByText("14時間30分")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "月齢に合わせる" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "カスタム" })[1]);

    expect(screen.getByText("2時間10分")).toBeInTheDocument();
    expect(screen.getByText("14時間30分")).toBeInTheDocument();
  });

  it("can restore unsaved edits to the last saved gauge settings", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.displayName = "A";
    renderSettings(app);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "Aのおむつ間隔を30分長くする" }));
    expect(screen.getAllByText("2時間30分").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "保存した設定に戻す" }));
    expect(screen.queryByText("保存していない変更があります。")).toBeNull();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("warns before leaving the care gauge tab with unsaved edits", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.displayName = "A";
    renderSettings(app);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "Aのおむつ間隔を30分長くする" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "データ管理" }), { button: 0, ctrlKey: false });

    expect(screen.getByText("お世話ゲージに編集中の値があります")).toBeInTheDocument();
    expect(screen.getByText(/保存せずに別のタブへ移動/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存せずに移動" }));
    expect(screen.getByRole("button", { name: "睡眠管理を切り替え" })).toBeInTheDocument();
  });

  it("saves gauge edits explicitly before closing", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.displayName = "A";
    const setApp = vi.fn();
    renderSettings(app, false, setApp);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "Aのおむつ間隔を30分長くする" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(setApp).toHaveBeenCalled();
    expect(screen.getByText("保存しました。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
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

  it("lets each baby customize the diaper gauge timing", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.displayName = "A";
    renderSettings(app, true);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "お世話ゲージ" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "Aのおむつ間隔を30分長くする" }));

    expect(screen.getAllByText("2時間30分").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/交換直後はゲージが空になります/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/たつと満タンになります/).length).toBeGreaterThan(0);
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