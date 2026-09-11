import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { detectHorizontalSwipe, type SwipePoint } from "@/lib/horizontal-swipe"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

let historyPreloadStarted = false

const preloadHistoryModals = () => {
  if (historyPreloadStarted || typeof window === "undefined") return
  historyPreloadStarted = true
  void Promise.all([
    import("@/components/EventHistoryModal"),
    import("@/components/SleepHistoryModal"),
  ]).catch(() => {
    historyPreloadStarted = false
  })
}

const historyLabels = ["食事履歴", "おむつ履歴", "睡眠履歴"] as const

const switchHistoryBabyFromSwipe = (
  dialogContent: HTMLElement,
  direction: "left" | "right"
) => {
  const heading = dialogContent.querySelector<HTMLElement>(
    "[role='heading'], h1, h2, h3"
  )
  const headingText = heading?.textContent?.trim() ?? ""
  const historyLabel = historyLabels.find((label) => headingText.endsWith(label))
  if (!historyLabel) return false

  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      `.twinly-baby-tabs-content button[aria-label$="の${historyLabel}を開く"]`
    )
  )
  if (buttons.length < 2) return false

  const currentIndex = buttons.findIndex((button) => {
    const ariaLabel = button.getAttribute("aria-label") ?? ""
    return ariaLabel.replace(/を開く$/, "") === headingText
  })
  if (currentIndex < 0) return false

  const targetIndex = direction === "left" ? currentIndex + 1 : currentIndex - 1
  const target = buttons[targetIndex]
  if (!target) return false

  target.click()
  return true
}

function DialogOpeningSkeleton() {
  const [visible, setVisible] = React.useState(true)

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => setVisible(false), 170)
    return () => window.clearTimeout(timeoutId)
  }, [])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      data-testid="dialog-opening-skeleton"
      className="pointer-events-none absolute inset-0 z-[60] overflow-hidden bg-background p-6 sm:rounded-lg"
    >
      <div className="animate-pulse space-y-5">
        <div className="space-y-2">
          <div className="h-5 w-2/5 rounded bg-muted" />
          <div className="h-3 w-3/5 rounded bg-muted/70" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-20 rounded-xl border bg-muted/40" />
          ))}
        </div>
        <div className="h-48 rounded-xl border bg-muted/30" />
      </div>
    </div>
  )
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onTouchStart, onTouchEnd, onTouchCancel, ...props }, ref) => {
  const swipeStartRef = React.useRef<SwipePoint | null>(null)

  React.useEffect(() => {
    const timerId = window.setTimeout(preloadHistoryModals, 0)
    return () => window.clearTimeout(timerId)
  }, [])

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    onTouchStart?.(event)
    if (event.defaultPrevented) return
    const touch = event.touches.item(0)
    swipeStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    onTouchEnd?.(event)
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (event.defaultPrevented || !start) return
    const touch = event.changedTouches.item(0)
    if (!touch) return

    const direction = detectHorizontalSwipe(start, {
      x: touch.clientX,
      y: touch.clientY,
    })
    if (!direction) return

    if (switchHistoryBabyFromSwipe(event.currentTarget, direction)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const handleTouchCancel = (event: React.TouchEvent<HTMLDivElement>) => {
    swipeStartRef.current = null
    onTouchCancel?.(event)
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] touch-pan-y gap-4 border bg-background text-foreground p-6 shadow-lg duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 sm:rounded-lg",
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        {...props}
      >
        <DialogOpeningSkeleton />
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
