const test = require("node:test");
const assert = require("node:assert/strict");
const { consumeWearDiaperStock, restoreWearDiaperStock } = require("../wear-stock");

const app = () => ({
  diaperStockManagementEnabled: true,
  profiles: {
    A: { diaperSize: "M", diaperStockBySize: { M: 5 } },
    B: { diaperSize: "M", diaperStockBySize: { M: 9 } },
  },
  events: [],
});

test("Wear consumption preserves target-baby stock as authority when copies disagree", () => {
  const state = app();
  const event = { id: "d1", babyId: "B", type: "diaper" };
  const next = consumeWearDiaperStock(state, event);
  assert.equal(event.diaperSizeUsed, "M");
  assert.equal(event.diaperStockConsumed, 1);
  assert.equal(next.profiles.A.diaperStockBySize.M, 8);
  assert.equal(next.profiles.B.diaperStockBySize.M, 8);
});

test("Wear restore preserves the original recorded size and target-baby authority", () => {
  const state = app();
  const event = { id: "d1", babyId: "A", type: "diaper", diaperSizeUsed: "M", diaperStockConsumed: 1 };
  const next = restoreWearDiaperStock(state, event);
  assert.equal(next.profiles.A.diaperStockBySize.M, 6);
  assert.equal(next.profiles.B.diaperStockBySize.M, 6);
});

test("Wear keeps historical missing flag behavior enabled unless explicitly false", () => {
  const state = app();
  delete state.diaperStockManagementEnabled;
  const event = { id: "d1", babyId: "A", type: "diaper" };
  const next = consumeWearDiaperStock(state, event);
  assert.equal(next.profiles.A.diaperStockBySize.M, 4);
});
