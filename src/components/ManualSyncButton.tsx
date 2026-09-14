import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import type { StoreStatus } from "@/data/app-store";
import {
  hasSyncActivity,
  isSyncSettled,
  shouldShowAutomaticSyncSpinner,
  type ManualSyncSignals,
} from "@/lib/manual-sync-state";

type Props = {
  status: StoreStatus;
  onSync: () => void;
};

type ManualState = "idle" | "syncing" | "success";

const SUCCESS_HOLD_MS = 850;
const SETTLE_TIMEOUT_MS = 16_000;

const toSignals = (status: StoreStatus): ManualSyncSignals => ({
  checking: Boolean(status.checking),
  routineStatus: status.pending > 0,
  syncMessage: status.error ?? undefined,
});

export function ManualSyncButton({ status, onSync }: Props) {
  const [manualState, setManualState] = useState<ManualState>("idle");
  const latestStatus = useRef(status);
  const settleTimer = useRef<number | null>(null);
  const successTimer = useRef<number | null>(null);

  useEffect(() => {
    latestStatus.current = status;
  }, [status]);

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (successTimer.current !== null) window.clearTimeout(successTimer.current);
  }, []);

  const startManualSync = () => {
    if (manualState === "syncing") return;
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (successTimer.current !== null) window.clearTimeout(successTimer.current);

    const startedAt = Date.now();
    let sawSyncActivity = false;
    setManualState("syncing");
    onSync();

    const checkSettled = () => {
      const signals = toSignals(latestStatus.current);
      if (hasSyncActivity(signals)) sawSyncActivity = true;
      const elapsed = Date.now() - startedAt;

      if (isSyncSettled(signals) && (sawSyncActivity || elapsed >= 450)) {
        settleTimer.current = null;
        setManualState("success");
        successTimer.current = window.setTimeout(() => {
          successTimer.current = null;
          setManualState("idle");
        }, SUCCESS_HOLD_MS);
        return;
      }

      if (elapsed >= SETTLE_TIMEOUT_MS) {
        settleTimer.current = null;
        setManualState("idle");
        return;
      }

      settleTimer.current = window.setTimeout(checkSettled, 80);
    };

    settleTimer.current = window.setTimeout(checkSettled, 80);
  };

  const automaticSyncing = shouldShowAutomaticSyncSpinner(toSignals(status), !status.ready);
  const syncing = manualState === "syncing" || (manualState === "idle" && automaticSyncing);
  const stopHeaderGesture = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      aria-label="同期"
      aria-busy={syncing}
      title="同期"
      disabled={manualState === "syncing"}
      onClick={(event) => {
        event.stopPropagation();
        startManualSync();
      }}
      onPointerDown={stopHeaderGesture}
      onPointerUp={stopHeaderGesture}
      onPointerCancel={stopHeaderGesture}
      onDoubleClick={stopHeaderGesture}
      onContextMenu={stopHeaderGesture}
      className={manualState === "success" ? "rounded-full bg-green-500 text-white hover:bg-green-500 hover:text-white" : undefined}
    >
      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
    </Button>
  );
}
