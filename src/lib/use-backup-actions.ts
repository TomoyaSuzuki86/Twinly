import { useCallback, type ChangeEvent, type RefObject } from "react";
import type { AppState } from "@/types";
import { fmtDate } from "./utils";
import { parseBackup } from "./backup";
import type { AppStore, StoreStatus } from "@/data/app-store";

type UpdateApp = (
  updater: (previous: AppState) => AppState,
  options?: { absoluteSettings?: boolean }
) => boolean;

export function useBackupActions({
  store,
  status,
  updateApp,
  setActiveDate,
}: {
  store: RefObject<AppStore | null>;
  status: StoreStatus;
  updateApp: UpdateApp;
  setActiveDate: (date: string) => void;
}) {
  const handleExport = useCallback(async () => {
    try {
      if (!store.current) throw new Error("記録を読み込んでいます。");
      const complete = await store.current.exportAll();
      const blob = new Blob([JSON.stringify(complete, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `twinly-backup-${fmtDate(new Date())}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "全履歴を書き出せませんでした。");
    }
  }, [store]);

  const handleImport = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (status.fromCache || status.pending) {
      alert("通信が回復し、同期が完了してから復元してください。");
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const importedState = parseBackup(loadEvent.target?.result as string);
        if (!confirm("現在の記録をバックアップの内容で置き換えますか？")) return;
        if (updateApp(() => importedState, { absoluteSettings: true })) {
          setActiveDate(importedState.ui.lastViewedDate);
          alert("復元内容を端末に保存しました。同期状況をご確認ください。");
        }
      } catch {
        alert("ファイルの読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
  }, [setActiveDate, status.fromCache, status.pending, updateApp]);

  return { handleExport, handleImport };
}
