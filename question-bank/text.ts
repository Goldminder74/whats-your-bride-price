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
