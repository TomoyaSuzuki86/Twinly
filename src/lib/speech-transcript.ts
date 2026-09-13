const compactText = (value: string) => value.replace(/\s+/g, "");

const rawOffsetForCompactIndex = (value: string, compactIndex: number) => {
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (!/\s/.test(value[index])) {
      if (seen === compactIndex) return index;
      seen += 1;
    }
  }
  return value.length;
};

export const collapseRepeatedTranscriptPrefix = (rawValue: string) => {
  const value = rawValue.trim().replace(/\s+/g, " ");
  const compact = compactText(value);
  if (compact.length < 12) return value;

  // Android Chrome can occasionally return one alternative as
  // "prefix + prefix + continuation". Prefer the second, more complete copy.
  // Do not collapse an exact two-times repetition because that can be intentional speech.
  for (let prefixLength = Math.floor(compact.length / 2); prefixLength >= 6; prefixLength -= 1) {
    const prefix = compact.slice(0, prefixLength);
    if (!compact.slice(prefixLength).startsWith(prefix)) continue;
    if (compact.length <= prefixLength * 2) continue;

    const secondCopyOffset = rawOffsetForCompactIndex(value, prefixLength);
    const deduped = value.slice(secondCopyOffset).trim();
    return deduped || value;
  }

  return value;
};

export const mergeTranscriptSegments = (segments: string[]) => {
  return segments.reduce((merged, rawSegment) => {
    const segment = collapseRepeatedTranscriptPrefix(rawSegment);
    if (!segment) return merged;
    if (!merged) return segment;

    const compactMerged = compactText(merged);
    const compactSegment = compactText(segment);

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
