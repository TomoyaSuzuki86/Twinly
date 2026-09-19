import type { SyncConnectionState } from "./app-store";

export type SyncDiagnosticEntry = {
  at: number;
  event: string;
  connection: SyncConnectionState;
  pending: number;
  confirmedPending: number;
  conflictCount: number;
  pendingWaitMs: number;
  fromCache: boolean;
  checking: boolean;
  lastServerConfirmedAt: number | null;
};

const DIAGNOSTIC_LIMIT = 80;

export const appendSyncDiagnostic = (
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  entry: SyncDiagnosticEntry
) => {
  try {
    const diagnosticsKey = `${key}.diagnostics`;
    const raw = storage.getItem(diagnosticsKey);
    const previous = raw ? JSON.parse(raw) : [];
    const entries = Array.isArray(previous) ? previous : [];
    entries.push(entry);
    storage.setItem(diagnosticsKey, JSON.stringify(entries.slice(-DIAGNOSTIC_LIMIT)));
  } catch {
    // Diagnostics must never block recording or synchronization.
  }
};
