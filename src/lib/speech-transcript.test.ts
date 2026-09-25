import { describe, expect, it } from "vitest";
import {
  collapseExactRepeatedTranscript,
  collapseRepeatedTranscriptPrefix,
  mergeTranscriptSegments,
} from "./speech-transcript";

describe("free-form speech transcript exact duplication", () => {
  it("collapses a short exact two-copy Android Chrome memo artifact", () => {
    expect(collapseExactRepeatedTranscript("沐浴した沐浴した")).toBe("沐浴した");
  });

  it("collapses the same memo when recognition inserts whitespace between copies", () => {
    expect(collapseExactRepeatedTranscript("沐浴した 沐浴した")).toBe("沐浴した");
  });

  it("keeps an ordinary free-form memo unchanged", () => {
    expect(collapseExactRepeatedTranscript("沐浴してからミルクを飲んだ")).toBe("沐浴してからミルクを飲んだ");
  });
});

describe("speech transcript cumulative results", () => {
  it("does not repeat a phrase included in the next cumulative result", () => {
    expect(mergeTranscriptSegments(["おむつ", "おむつ 10分前"])).toBe("おむつ 10分前");
  });

  it("keeps separate consecutive recognition segments", () => {
    expect(mergeTranscriptSegments(["おむつ", "10分前"])).toBe("おむつ 10分前");
  });

  it("merges a partial suffix-prefix overlap", () => {
    expect(mergeTranscriptSegments(["かなた おむつ", "おむつ 10分前"])).toBe("かなた おむつ 10分前");
  });

  it("does not remove legitimate non-adjacent words", () => {
    expect(mergeTranscriptSegments(["かなた", "おむつ", "10分前"])).toBe("かなた おむつ 10分前");
  });

  it("collapses a repeated prefix inside one Android Chrome transcript", () => {
    expect(
      collapseRepeatedTranscriptPrefix("ひなた ミルク飲み中 ひなた ミルク飲み中 とてもニコニコしていて可愛い")
    ).toBe("ひなた ミルク飲み中 とてもニコニコしていて可愛い");
  });

  it("collapses a long exact two-copy Android Chrome artifact", () => {
    expect(
      collapseRepeatedTranscriptPrefix("起きてすぐ ミルクを飲んでて 起きてすぐ ミルクを飲んでて")
    ).toBe("起きてすぐ ミルクを飲んでて");
  });

  it("deduplicates an exact repeated result before appending a later continuation", () => {
    expect(
      mergeTranscriptSegments([
        "起きてすぐ ミルクを飲んでて 起きてすぐ ミルクを飲んでて",
        "結構グビグビ 飲んでるあと 手の動きが可愛い",
      ])
    ).toBe("起きてすぐ ミルクを飲んでて 結構グビグビ 飲んでるあと 手の動きが可愛い");
  });

  it("keeps ordinary non-duplicated speech unchanged", () => {
    expect(collapseRepeatedTranscriptPrefix("ひなた ミルク飲み中 とてもニコニコしていて可愛い")).toBe(
      "ひなた ミルク飲み中 とてもニコニコしていて可愛い"
    );
  });

  it("keeps an intentional short exact phrase repetition", () => {
    expect(collapseRepeatedTranscriptPrefix("とてもかわいい とてもかわいい")).toBe(
      "とてもかわいい とてもかわいい"
    );
  });
});
