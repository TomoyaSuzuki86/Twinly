import { afterEach, expect, it } from "vitest";
import { beginBackgroundSync, isBackgroundSyncing } from "./background-sync";

afterEach(() => {
  delete document.documentElement.dataset.twinlyBackgroundSyncing;
});

it("keeps the header sync state active until every background task finishes", () => {
  const finishFamily = beginBackgroundSync("family");
  const finishAccess = beginBackgroundSync("access");

  expect(isBackgroundSyncing()).toBe(true);
  expect(document.documentElement.dataset.twinlyBackgroundSyncing).toBe("true");

  finishFamily();
  expect(isBackgroundSyncing()).toBe(true);
  expect(document.documentElement.dataset.twinlyBackgroundSyncing).toBe("true");

  finishAccess();
  expect(isBackgroundSyncing()).toBe(false);
  expect(document.documentElement.dataset.twinlyBackgroundSyncing).toBeUndefined();
});

it("allows a completion callback to be called more than once safely", () => {
  const finish = beginBackgroundSync("family");
  finish();
  finish();

  expect(isBackgroundSyncing()).toBe(false);
});
