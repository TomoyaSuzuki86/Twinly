import { AnimatePresence, motion } from "framer-motion";
import { Check, Undo2 } from "lucide-react";
import { Button } from "./ui/button";

interface SnackbarUndoProps {
  open: boolean;
  message: string;
  detail?: string;
  onUndo: () => void;
  onRetry?: () => void;
  onClose: () => void;
}

export function SnackbarUndo({
  open,
  message,
  detail,
  onUndo,
  onRetry,
  onClose,
}: SnackbarUndoProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed bottom-4 left-1/2 z-50 w-[min(720px,calc(100%-16px))] -translate-x-1/2"
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 18, opacity: 0 }}
        >
          <div className="overflow-hidden rounded-lg border bg-primary text-primary-foreground shadow-2xl">
            <div className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="flex min-w-0 items-start gap-3 px-4 py-3 sm:px-5 sm:py-4">
                <Check className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{message}</div>
                  {detail ? (
                    <div className="mt-1 whitespace-normal break-words text-xs leading-relaxed opacity-85">
                      聞き取り: 「{detail}」
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 border-t sm:contents">
                <Button variant="ghost" className="h-12 rounded-none sm:h-full sm:border-l" onClick={onUndo}>
                  <Undo2 className="mr-2 h-5 w-5" />
                  取り消す
                </Button>
                {onRetry ? (
                  <Button variant="ghost" className="h-12 rounded-none border-l sm:h-full" onClick={onRetry}>
                    やり直す
                  </Button>
                ) : null}
              </div>
            </div>
            <button className="sr-only" onClick={onClose} aria-label="close-snackbar" />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
