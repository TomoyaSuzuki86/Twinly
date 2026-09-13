import { describe, expect, it } from "vitest";
import { collapseRepeatedTranscriptPrefix, mergeTranscriptSegments } from "./speech-transcript";

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

  it("keeps ordinary non-duplicated speech unchanged", () => {
    expect(collapseRepeatedTranscriptPrefix("ひなた ミルク飲み中 とてもニコニコしていて可愛い")).toBe(
      "ひなた ミルク飲み中 とてもニコニコしていて可愛い"
    );
  });
});
