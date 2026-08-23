import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";
import { createInitialAppState } from "@/lib/app-state";

describe("SettingsModal", () => {
  afterEach(cleanup);

  it("does not show a Google Calendar settings tab", () => {
    render(
      <SettingsModal
        open
        onOpenChange={vi.fn()}
        app={createInitialAppState(new Date("2026-04-18T09:00:00+09:00"))}
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

    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  it("allows sleep targets to be overridden and restored to the age default", () => {
    const app = createInitialAppState(new Date("2026-04-18T09:00:00+09:00"));
    app.profiles.A.sleepTargetHoursOverride = 10;

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

    const sleepTargetInputs = screen.getAllByLabelText("1日の睡眠目標") as HTMLInputElement[];
    expect(sleepTargetInputs[0].value).toBe("10");

    fireEvent.click(screen.getAllByRole("button", { name: "月齢の目安に戻す" })[0]);
    expect(sleepTargetInputs[0].value).toBe("");
  });
});
