import { useEffect, useRef, useState } from "react";

type WakeLockSentinelLike = EventTarget & {
  released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

export type WakeLockState = "active" | "unsupported" | "released" | "error";

export function useScreenWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [state, setState] = useState<WakeLockState>("released");

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") {
      setState("released");
      return undefined;
    }

    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) {
      setState("unsupported");
      return undefined;
    }

    let cancelled = false;

    const releaseCurrent = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        await sentinel.release().catch(() => undefined);
      }
    };

    const requestWakeLock = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await releaseCurrent();
        const sentinel = await wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = sentinel;
        setState("active");
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
            setState("released");
          }
        });
      } catch (error) {
        console.warn("Screen Wake Lock request failed", error);
        setState("error");
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        void releaseCurrent();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseCurrent();
      setState("released");
    };
  }, [enabled]);

  return state;
}
