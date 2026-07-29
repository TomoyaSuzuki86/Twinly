export const mergeTranscriptSegments = (segments: string[]) => {
  return segments.reduce((merged, rawSegment) => {
    const segment = rawSegment.trim();
    if (!segment) return merged;
    if (!merged) return segment;

    const compactMerged = merged.replace(/\s+/g, "");
    const compactSegment = segment.replace(/\s+/g, "");

    // Chrome on Android may expose a new result as the whole utterance while
    // keeping the preceding result in the list. Avoid appending that shared
    // prefix twice (for example: "おむつ" + "おむつ 10分前").
    if (compactSegment.startsWith(compactMerged)) return segment;
    if (compactMerged.endsWith(compactSegment)) return merged;

    const maxOverlap = Math.min(compactMerged.length, compactSegment.length);
    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      if (compactMerged.slice(-overlap) === compactSegment.slice(0, overlap)) {
        let compactCharactersSeen = 0;
        let appendFrom = 0;
        while (appendFrom < segment.length && compactCharactersSeen < overlap) {
          if (!/\s/.test(segment[appendFrom])) compactCharactersSeen += 1;
          appendFrom += 1;
        }
        const remainder = segment.slice(appendFrom).trim();
        return remainder ? `${merged} ${remainder}` : merged;
      }
    }

    return `${merged} ${segment}`;
  }, "");
};
