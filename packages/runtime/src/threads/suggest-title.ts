import { isStopword } from "./stopwords.js";
import { clip, tokenize, weighSentences } from "./words.js";

export interface TitleMessage {
  role: "user" | "assistant";
  content: string;
}

const maxPhraseWords = 3;
const japanese = /[぀-ヿ一-鿿]/;

interface Stats {
  frequency: Map<string, number>;
  firstSeen: Map<string, number>;
}

const key = (word: string) => word.toLowerCase();

function collect(messages: TitleMessage[], role: TitleMessage["role"]): Stats {
  const frequency = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let position = 0;
  for (const message of messages) {
    if (message.role !== role) continue;
    const sentences =
      role === "user"
        ? weighSentences(message.content)
        : [{ text: clip(message.content), weight: 1 }];
    for (const sentence of sentences) {
      for (const word of tokenize(sentence.text)) {
        if (word === null || isStopword(word)) continue;
        frequency.set(key(word), (frequency.get(key(word)) ?? 0) + sentence.weight);
        if (!firstSeen.has(key(word))) firstSeen.set(key(word), position);
        position++;
      }
    }
  }
  // Position only means something in short text; in a long paste the ask decides.
  if (position > 60) for (const word of firstSeen.keys()) firstSeen.set(word, 0);
  return { frequency, firstSeen };
}

/** Runs of consecutive non-stopwords, cut into windows of up to three words (as in RAKE). */
function candidatePhrases(messages: TitleMessage[]): string[][] {
  const phrases: string[][] = [];
  for (const message of messages) {
    let run: string[] = [];
    const flush = () => {
      for (let size = Math.min(maxPhraseWords, run.length); size >= 1; size--)
        for (let start = 0; start + size <= run.length; start++)
          phrases.push(run.slice(start, start + size));
      run = [];
    };
    for (const word of tokenize(clip(message.content))) {
      if (word === null || isStopword(word)) flush();
      else run.push(word);
    }
    flush();
  }
  return phrases;
}

/**
 * Names a conversation from what the user said, with the assistant only confirming a topic.
 * Returns undefined while the user has not said enough to name it, such as after "Hi".
 */
export function suggestThreadTitle(messages: TitleMessage[]): string | undefined {
  const user = collect(messages, "user");
  if (user.frequency.size < 2) return undefined;
  const assistant = collect(messages, "assistant");
  const assistantText = messages
    .filter((message) => message.role === "assistant")
    .map((message) => clip(message.content).toLowerCase())
    .join(" ");

  const wordScore = (word: string) => {
    const frequency = user.frequency.get(key(word)) ?? 0;
    if (frequency === 0) return 0;
    const early = 1 / Math.log2(2 + (user.firstSeen.get(key(word)) ?? 0) / 4);
    return (frequency + 0.5 * (assistant.frequency.get(key(word)) ?? 0)) * (0.5 + early);
  };

  const scored = new Map<string, { words: string[]; score: number }>();
  for (const phrase of candidatePhrases(messages)) {
    const id = phrase.map(key).join(" ");
    if (scored.has(id) || !phrase.every((word) => user.frequency.has(key(word)))) continue;
    let score = phrase.reduce((sum, word) => sum + wordScore(word), 0);
    // The assistant restating the user's phrase is a strong topic signal.
    if (phrase.length > 1 && assistantText.includes(id)) score *= 1.5;
    // A very short single word is a weak title.
    if (phrase.length === 1 && (phrase[0]?.length ?? 0) < 4) score *= 0.5;
    scored.set(id, { words: phrase, score });
  }

  const ranked = [...scored.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top) return undefined;
  const used = new Set(top.words.map(key));
  const second = ranked.find(
    (item) =>
      item !== top &&
      item.score >= 0.45 * top.score &&
      !item.words.some((word) => used.has(key(word))),
  );
  const joiner = japanese.test(top.words.join("")) ? "" : " ";
  const title = [top, second]
    .filter((item) => item !== undefined)
    .map((item) => item.words.join(joiner))
    .join(" · ");
  return title.charAt(0).toUpperCase() + title.slice(1);
}
