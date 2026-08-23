import { LogEvent } from "@/types";
import { fmtDate } from "@/lib/utils";

export type WeeklyTimelineDay = {
  key: string;
  date: Date;
  events: LogEvent[];
};

export const getWeekStart = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  const day = value.getDay();
  value.setDate(value.getDate() + (day === 0 ? -6 : 1 - day));
  return value;
};

export const shiftWeek = (weekStart: Date, amount: number) => {
  const value = new Date(weekStart);
  value.setDate(value.getDate() + amount * 7);
  return getWeekStart(value);
};

export const getWeekEnd = (weekStart: Date) => {
  const value = getWeekStart(weekStart);
  value.setDate(value.getDate() + 6);
  value.setHours(23, 59, 59, 999);
  return value;
};

export const buildWeeklyTimeline = (events: LogEvent[], weekStart: Date): WeeklyTimelineDay[] => {
  const start = getWeekStart(weekStart);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return {
      key: fmtDate(date),
      date,
      events: [] as LogEvent[],
    };
  });
  const dayByKey = new Map(days.map((day) => [day.key, day]));
  const rangeEnd = getWeekEnd(start).getTime();

  events
    .filter(
      (event) =>
        (event.type === "milk" || event.type === "solidFood" || event.type === "diaper") &&
        event.timestamp >= start.getTime() &&
        event.timestamp <= rangeEnd
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .forEach((event) => {
      dayByKey.get(fmtDate(new Date(event.timestamp)))?.events.push(event);
    });

  return days;
};
