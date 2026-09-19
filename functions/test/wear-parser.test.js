const test = require("node:test");
const assert = require("node:assert/strict");
const { parseVoiceTextWithRules, projectWearEvents } = require("../wear-parser");

const profiles = {
  A: { displayName: "奏汰", voiceAliases: [] },
  B: { displayName: "日向", voiceAliases: [] },
};

test("rule parser identifies baby, milk amount and relative time", () => {
  const now = new Date("2026-09-20T10:00:00+09:00");
  const parsed = parseVoiceTextWithRules({
    text: "奏汰 ミルク 180ミリ 10分前",
    profiles,
    now,
  });
  assert.equal(parsed.babyId, "A");
  assert.equal(parsed.type, "milk");
  assert.equal(parsed.milkMl, 180);
  assert.equal(parsed.timestamp, new Date("2026-09-20T09:50:00+09:00").getTime());
});

test("forced baby id wins over transcript baby name", () => {
  const parsed = parseVoiceTextWithRules({
    text: "奏汰 おしっこ",
    profiles,
    forcedBabyId: "B",
  });
  assert.equal(parsed.babyId, "B");
  assert.equal(parsed.diaperKind, "pee");
});

test("projector expands both babies with per-baby milk amount", () => {
  let id = 0;
  const events = projectWearEvents({
    uid: "u1",
    transcript: "ミルク",
    parsed: {
      babyId: "both",
      type: "milk",
      milkMlByBaby: { A: 170, B: 180 },
      milkMethod: "bottle",
      timestamp: 123,
    },
    idFactory: () => `e${++id}`,
  });
  assert.deepEqual(events.map((event) => [event.id, event.babyId, event.milkMl]), [
    ["e1", "A", 170],
    ["e2", "B", 180],
  ]);
  assert.ok(events.every((event) => event.createdByUid === "u1" && event.timestamp === 123));
});
