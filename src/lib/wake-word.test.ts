import { describe, expect, it } from "vitest";
import { containsTwinlyWakeWord, findTwinlyWakeWord } from "./wake-word";

describe("Twinly wake word", () => {
  it.each([
    "ヘイツイン",
    "ヘイ ツイン",
    "ヘイ、ツイン",
    "ヘイ！ツイン",
    "へいついん",
    "ヘーイ ツイン",
    "へーい twin",
    "Hey Twin",
    "hey twin",
    "ヘイ twin",
    "hey ついん",
    "Hey、ツイン",
  ])(
    "recognizes %s",
    (transcript) => {
      expect(containsTwinlyWakeWord(transcript)).toBe(true);
    }
  );

  it("recognizes the wake word inside a longer transcript", () => {
    expect(containsTwinlyWakeWord("ねえ、ヘイツイン")).toBe(true);
  });

  it.each(["ヘイ", "ツイン", "Twin"])("does not react to %s by itself", (transcript) => {
    expect(containsTwinlyWakeWord(transcript)).toBe(false);
  });

  it("does not react to an ordinary Twin mention", () => {
    expect(containsTwinlyWakeWord("ツインを開いて")).toBe(false);
  });

  it("selects a matching speech-recognition alternative", () => {
    expect(findTwinlyWakeWord(["ツインを開いて", "Hey Twin"])).toBe("Hey Twin");
  });
});
