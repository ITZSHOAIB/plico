const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
const asks = /[?？]\s*$|\b(please|can you|could you|would you|bitte|por favor)\b|ください/i;

/** Words in order, with `null` marking a phrase break such as punctuation. */
export function tokenize(text: string): Array<string | null> {
  const out: Array<string | null> = [];
  let joinNext = false;
  for (const part of wordSegmenter.segment(text)) {
    if (!part.isWordLike) {
      if (part.segment === "-" && typeof out.at(-1) === "string") joinNext = true;
      else if (/\S/.test(part.segment) && !/^['’]$/.test(part.segment)) out.push(null);
      continue;
    }
    const word = part.segment.replace(/['’]s$/i, "");
    if (joinNext) out[out.length - 1] += `-${word}`;
    else out.push(word);
    joinNext = false;
  }
  return out;
}

/** Long pastes are mostly context, so keep the start and the end, where the ask usually is. */
export function clip(text: string): string {
  return text.length <= 4000 ? text : `${text.slice(0, 3000)}\n${text.slice(-1000)}`;
}

/**
 * Splits a message into weighted sentences. In a long message the sentence that asks for
 * something counts most; a short message is all ask, so it stays whole.
 */
export function weighSentences(text: string): Array<{ text: string; weight: number }> {
  const parts = [...sentenceSegmenter.segment(clip(text))].map((part) => part.segment);
  const isAsk = parts.map((part) => asks.test(part.trim()));
  if (text.split(/\s+/).length <= 60 || !isAsk.includes(true))
    return [{ text: parts.join(""), weight: 1 }];
  return parts.map((part, index) => ({ text: part, weight: isAsk[index] ? 3 : 0.5 }));
}
