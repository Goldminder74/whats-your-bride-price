const STOP = new Set([
  "about", "after", "again", "among", "because", "before", "being", "between",
  "could", "every", "first", "from", "have", "into", "many", "more", "most",
  "other", "their", "there", "these", "those", "three", "through", "under",
  "using", "which", "while", "whose", "with", "would", "your",
]);

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function contentTokens(value: string): string[] {
  return [...new Set(normalizeText(value).split(" ").filter((word) => word.length >= 5 && !STOP.has(word)))];
}

export function jaccard(left: string, right: string): number {
  const a = new Set(contentTokens(left));
  const b = new Set(contentTokens(right));
  if (!a.size && !b.size) return 1;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

export function pageSupportsClaim(claim: string, pageText: string): boolean {
  const tokens = contentTokens(claim);
  if (tokens.length < 2) return false;
  const page = normalizeText(pageText);
  const hits = tokens.filter((token) => page.includes(token));
  return hits.length >= 2 && hits.length >= Math.min(3, tokens.length);
}

/** Prompts that name a position must keep option order, and so must pictures. */
export function fixedOptionOrder(prompt: string, explanation: string, kind: string): boolean {
  if (kind === "image") return true;
  return /\b(?:first|second|third|fourth|numbered|ordered|sequence|following order|from left|from right)\b/i.test(prompt)
    || /\b(?:first|second|third|fourth|former|latter)\b/i.test(explanation);
}

export function sameAnswerSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  return a.every((value, index) => value === b[index]);
}

export function correctTexts(options: readonly string[], correct: readonly number[]): string[] {
  return correct.map((index) => normalizeText(options[index] || "")).sort();
}

export function wordRoots(value: string): string[] {
  return [...new Set(normalizeText(value).split(" ").filter((word) => word.length >= 4).map((word) => word.replace(/(?:ing|ers|er|es|s)$/u, "")))];
}

const GENERIC_ANSWER_WORDS = new Set([
  "lake", "river", "mount", "mountain", "canyon", "falls", "kingdom", "empire", "language", "music",
  "dance", "culture", "people", "club", "city", "town", "state", "national", "african", "south",
  "north", "west", "east", "central", "blanket", "arabic", "style", "group", "region", "football",
  "singer", "water", "coast", "island", "desert", "delta", "park", "cloth", "dress", "food", "dish",
  "genre", "team", "player", "about", "which", "their", "there", "other", "known", "called",
]);

/** The prompt states the correct answer, or one of its distinctive words. */
export function promptNamesAnswer(prompt: string, answer: string): boolean {
  const promptNorm = normalizeText(prompt);
  const answerNorm = normalizeText(answer);
  if (!answerNorm) return false;
  const promptWords = new Set(promptNorm.split(" ").filter(Boolean));
  if (answerNorm.length >= 4 && promptNorm.includes(answerNorm)) return true;
  return answerNorm.split(" ").some((token) => token.length >= 3 && !GENERIC_ANSWER_WORDS.has(token) && promptWords.has(token));
}

/** The correct option is named in the prompt, or it is the only option that shares a root with the prompt. */
export function answerLeaks(prompt: string, options: readonly string[], correct: readonly number[]): boolean {
  const promptNorm = normalizeText(prompt);
  const promptRoots = new Set(wordRoots(prompt));
  const shares = (option: string) => {
    const optionNorm = normalizeText(option);
    if (optionNorm.length >= 4 && (promptNorm.includes(optionNorm) || optionNorm.includes(promptNorm))) return true;
    return wordRoots(option).some((root) => root.length >= 4 && (promptRoots.has(root) || promptNorm.includes(root)));
  };
  for (const index of correct) {
    const option = options[index] || "";
    const optionNorm = normalizeText(option);
    if (optionNorm.length >= 4 && promptNorm.includes(optionNorm)) return true;
    if (wordRoots(option).some((root) => root.length >= 5 && promptNorm.includes(root))) return true;
  }
  const correctShares = correct.some((index) => shares(options[index] || ""));
  const distractorShares = options.some((option, index) => !correct.includes(index) && shares(option));
  return correctShares && !distractorShares;
}

const QUESTION_WORDS = new Set(["where", "which", "what", "when", "whose", "select", "name", "call", "called", "three", "people", "across", "country", "famous", "known", "widely", "spoken", "major", "official", "popular", "traditional"]);
const LOOSE_WORDS = new Set([
  ...QUESTION_WORDS,
  "wedding", "weddings", "marriage", "married", "bride", "groom", "couple", "couples", "family", "families",
  "ceremony", "ceremonies", "celebration", "celebrations", "worn", "wear", "wearing", "before", "after",
  "during", "often", "usually", "guests", "appears", "enter", "enters", "holds", "would", "expect",
]);
const FUNCTION_WORDS = new Set(["with", "from", "that", "this", "into", "over", "under", "after", "before", "their", "there", "when", "what", "your", "have", "been", "were", "they", "them", "than", "then", "also", "such", "only", "very", "more", "most", "some", "many", "much", "each", "both", "upon", "among", "through", "about", "which", "while", "where"]);

function wordHits(words: readonly string[], token: string): boolean {
  return words.some((word) => {
    if (word === token) return true;
    const longer = word.length >= token.length ? word : token;
    const shorter = word.length >= token.length ? token : word;
    if (shorter.length < 4 || !longer.startsWith(shorter)) return false;
    const rest = longer.slice(shorter.length);
    return /^(?:n|an|ian|ien|ese|lese|ish|i|s|d|ed|ing|ern)?$/.test(rest);
  });
}

function wantedWords(value: string): string[] {
  return [...new Set(normalizeText(value).split(" ").filter((word) => word.length >= 4 && !FUNCTION_WORDS.has(word)))];
}

export function supportingSentence(pageText: string, prompt: string, claim: string, answers: readonly string[]): string | null {
  const answerWords = answers.flatMap((answer) => wantedWords(answer));
  const answerBlob = new Set(answerWords);
  const claimTokens = contentTokens(claim).filter((token) => !answerBlob.has(token) && !LOOSE_WORDS.has(token));
  const smallStop = new Set(["this", "that", "with", "from", "your", "have", "been", "were", "they", "them", "into", "over", "than", "then", "also", "such", "only", "very", "some", "many", "much", "each", "both", "upon"]);
  const promptTokens = [...new Set(normalizeText(prompt).split(" ")
    .filter((token) => token.length >= 4 && !answerBlob.has(token) && !LOOSE_WORDS.has(token) && !QUESTION_WORDS.has(token) && !smallStop.has(token)))];
  const pieces = pageText
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 1200);
  const windows: string[] = [...pieces];
  for (let index = 0; index < pieces.length - 1; index += 1) {
    const joined = `${pieces[index]} ${pieces[index + 1]}`;
    if (joined.length <= 1600) windows.push(joined);
  }
  const mentions = (words: string[], answer: string) => {
    const needed = wantedWords(answer);
    if (needed.length) return needed.every((token) => wordHits(words, token));
    const needle = normalizeText(answer);
    return needle.length >= 3 && words.join(" ").includes(needle);
  };
  for (const sentence of windows) {
    if (/javascript|main menu|jump to content|cookie|==/i.test(sentence)) continue;
    const words = normalizeText(sentence).split(" ").filter(Boolean);
    const years = `${prompt} ${claim}`.match(/\b(?:1[6-9]|20)\d{2}\b/g) || [];
    if (years.some((year) => !words.includes(year))) continue;
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const blob = `${normalizeText(prompt)} ${normalizeText(claim)}`;
    if (months.some((month) => blob.includes(month) && !words.includes(month))) continue;
    if (!answers.every((answer) => mentions(words, answer))) continue;
    if (claimTokens.some((token) => !wordHits(words, token))) continue;
    if (promptTokens.length) {
      const hits = promptTokens.filter((token) => wordHits(words, token)).length;
      const needed = promptTokens.length <= 2 ? promptTokens.length : Math.ceil(promptTokens.length * 0.6);
      if (hits < needed) continue;
    }
    return sentence;
  }
  return null;
}
