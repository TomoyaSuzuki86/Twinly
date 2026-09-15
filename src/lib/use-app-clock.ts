import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fmtDate } from "./utils";

const AUTO_REFRESH_MS = 60 * 1000;

export const resolveActiveDateAfterDayChange = (
  activeDate: string,
  previousToday: string,
  nextToday: string
) => activeDate === previousToday ? nextToday : activeDate;

const subscribeClockRefresh = (refreshNow: () => void) => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") refreshNow();
  };
  const intervalId = window.setInterval(refreshNow, AUTO_REFRESH_MS);
  window.addEventListener("focus", refreshNow);
  window.addEventListener("pageshow", refreshNow);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("focus", refreshNow);
    window.removeEventListener("pageshow", refreshNow);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
};

export function useAppClock(setActiveDate: Dispatch<SetStateAction<string>>) {
  const [now, setNow] = useState(() => new Date());
  const todayDate = fmtDate(now);
  const lastKnownTodayRef = useRef(todayDate);

  const refreshNow = useCallback(() => setNow(new Date()), []);
  const resetClock = useCallback((lastViewedDate: string) => {
    lastKnownTodayRef.current = lastViewedDate;
    setNow(new Date());
  }, []);

  useEffect(() => subscribeClockRefresh(refreshNow), [refreshNow]);

  useEffect(() => {
    const previousToday = lastKnownTodayRef.current;
    if (todayDate === previousToday) return;
    setActiveDate((current) => resolveActiveDateAfterDayChange(current, previousToday, todayDate));
    lastKnownTodayRef.current = todayDate;
  }, [setActiveDate, todayDate]);

  return { now, todayDate, refreshNow, resetClock };
}
