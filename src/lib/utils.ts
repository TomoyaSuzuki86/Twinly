import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const fmtTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fmtDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const startOfDayMs = (d: Date) => {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd.getTime();
};

export const endOfDayMs = (d: Date) => {
  const dd = new Date(d);
  dd.setHours(23, 59, 59, 999);
  return dd.getTime();
};

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const daysSince = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const now = new Date();
  const ms = startOfDayMs(now) - startOfDayMs(d);
  const days = Math.floor(ms / 1000 / 60 / 60 / 24);
  return Math.max(0, days);
};
