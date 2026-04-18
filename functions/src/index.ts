import { setGlobalOptions } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

const TZ = "Asia/Tokyo";

const formatDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const startOfDayMs = (dateStr: string) => new Date(`${dateStr}T00:00:00+09:00`).getTime();
const endOfDayMs = (dateStr: string) => new Date(`${dateStr}T23:59:59+09:00`).getTime();

const buildSummary = (dateStr: string, events: any[]) => {
  const milkEvents = events.filter((e) => e.type === "milk");
  const diaperEvents = events.filter((e) => e.type === "diaper");
  const milkTotal = milkEvents.reduce((sum, e) => sum + (e.milkMl ?? 0), 0);
  return `${dateStr} のまとめ：ミルク ${milkEvents.length}回（合計 ${milkTotal}ml）、おむつ ${diaperEvents.length}回`;
};

export const nightlyDailySummary = onSchedule(
  { schedule: "0 23 * * *", timeZone: TZ },
  async () => {
    const db = admin.firestore();
    const today = formatDate(new Date());
    const rangeStart = startOfDayMs(today);
    const rangeEnd = endOfDayMs(today);

    const families = await db.collection("families").get();
    for (const family of families.docs) {
      const appRef = db.doc(`families/${family.id}/app/state`);
      const appSnap = await appRef.get();
      const appData = appSnap.data();
      const app = appData?.app;
      if (!app || !Array.isArray(app.events)) continue;

      const nextEvents = [...app.events];
      let changed = false;

      for (const babyId of ["A", "B"]) {
        const dayEvents = app.events.filter(
          (e: any) => e.babyId === babyId && e.timestamp >= rangeStart && e.timestamp <= rangeEnd
        );
        const hasDaily = dayEvents.some((e: any) => e.type === "daily");
        if (hasDaily) continue;

        const note = buildSummary(today, dayEvents);
        nextEvents.unshift({
          id: `daily-${today}-${babyId}`,
          babyId,
          type: "daily",
          timestamp: rangeEnd,
          note,
        });
        changed = true;
      }

      if (changed) {
        await appRef.set(
          {
            app: { ...app, events: nextEvents },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: "system",
          },
          { merge: true }
        );
        logger.info("Daily summary created", { familyId: family.id });
      }
    }
  }
);
