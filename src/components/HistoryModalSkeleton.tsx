import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type HistoryModalSkeletonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function HistoryModalSkeleton({ open, onOpenChange }: HistoryModalSkeletonProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[75vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>履歴を読み込み中…</DialogTitle>
          <DialogDescription>集計とグラフを準備しています。</DialogDescription>
        </DialogHeader>
        <div role="status" aria-live="polite" className="flex-1 overflow-hidden">
          <span className="sr-only">履歴を読み込み中</span>
          <div className="animate-pulse space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-28 rounded-xl border bg-muted/40" />
              <div className="h-28 rounded-xl border bg-muted/40" />
            </div>
            <div className="h-10 rounded-lg bg-muted/50" />
            <div className="h-[320px] rounded-xl border bg-muted/30" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
