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

// Recursively remove undefined properties from an object
export const removeUndefined = <T extends object>(obj: T): T => {
  const newObj: Partial<T> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          newObj[key] = removeUndefined(value as object) as T[Extract<keyof T, string>];
        } else if (Array.isArray(value)) {
          newObj[key] = value.map(item => (typeof item === 'object' && item !== null ? removeUndefined(item) : item)) as T[Extract<keyof T, string>];
        } else {
          newObj[key] = value;
        }
      }
    }
  }
  return newObj as T;
};

export const iconGradients = [
  { value: "from-violet-500 to-fuchsia-500", label: "バイオレット", bgColor: "bg-gradient-to-br from-violet-500 to-fuchsia-500", dimmedBgColor: "bg-violet-900/20" },
  { value: "from-sky-500 to-cyan-400", label: "スカイブルー", bgColor: "bg-gradient-to-br from-sky-500 to-cyan-400", dimmedBgColor: "bg-sky-900/20" },
  { value: "from-emerald-500 to-teal-400", label: "エメラルド", bgColor: "bg-gradient-to-br from-emerald-500 to-teal-400", dimmedBgColor: "bg-emerald-900/20" },
  { value: "from-amber-500 to-orange-400", label: "アンバー", bgColor: "bg-gradient-to-br from-amber-500 to-orange-400", dimmedBgColor: "bg-amber-900/20" },
  { value: "from-rose-500 to-red-400", label: "ローズ", bgColor: "bg-gradient-to-br from-rose-500 to-red-400", dimmedBgColor: "bg-rose-900/20" },
  { value: "from-indigo-500 to-blue-400", label: "インディゴ", bgColor: "bg-gradient-to-br from-indigo-500 to-blue-400", dimmedBgColor: "bg-indigo-900/20" },
  { value: "from-lime-500 to-green-400", label: "ライム", bgColor: "bg-gradient-to-br from-lime-500 to-green-400", dimmedBgColor: "bg-lime-900/20" },
  { value: "from-pink-500 to-purple-400", label: "ピンク", bgColor: "bg-gradient-to-br from-pink-500 to-purple-400", dimmedBgColor: "bg-pink-900/20" },
];