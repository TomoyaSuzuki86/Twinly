import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";
import { createInitialAppState } from "@/lib/app-state";

describe("SettingsModal", () => {
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
});
