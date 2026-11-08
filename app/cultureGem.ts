export type CultureFact = { id: string; category: string; answer: string; quote: string };

export const GEM_LIMIT = 140;

const SUBJECTS: Record<string, { label: string; emoji: string; tone: string }> = {
  FASHION: { label: "Fashion", emoji: "🧵", tone: "fashion" },
  FOOD: { label: "Food", emoji: "🍲", tone: "food" },
  HISTORY: { label: "History", emoji: "🏛", tone: "history" },
  POP: { label: "Pop", emoji: "🎤", tone: "pop" },
  ETIQUETTE: { label: "Etiquette", emoji: "🤝", tone: "etiquette" },
};

export function gemSubject(category: string): { label: string; emoji: string; tone: string } {
  return SUBJECTS[category] || { label: category.slice(0, 1) + category.slice(1).toLowerCase(), emoji: "✦", tone: "history" };
}

function fold(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function related(word: string, title: string): boolean {
  const left = fold(word);
  const right = fold(title);
  if (left.length < 3 || right.length < 3) return left === right && left.length > 0;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

/** Display copy only. Stored quotes stay as published. */
export function displayFact(answer: string, quote: string): string {
  let text = quote.replace(/\s+/g, " ").trim();
  text = text.replace(/\(\s*[,;][^)]*\)/g, " ");
  text = text.replace(/\([^)]{0,48}pronunciation:[^)]*\)/gi, " ");
  text = text.replace(/\([A-Za-z][^)]{0,28}:[^)]{0,180}\)/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  const title = answer.split(/\s+/).filter(Boolean);
  let parts = text.split(/\s+/).filter(Boolean);
  for (let guard = 0; guard < 8 && parts.length; guard += 1) {
    if (title.length && title.every((word, index) => related(parts[index] || "", word))) {
      parts = parts.slice(title.length);
      continue;
    }
    if (parts.length >= 2 && related(parts[0], parts[1]) && title.some((word) => related(parts[0], word))) {
      parts = parts.slice(1);
      continue;
    }
    if (/^or$/i.test(parts[0] || "") && parts[1] && title.some((word) => related(parts[1], word))) {
      parts = parts.slice(2);
      continue;
    }
    if (title.some((word) => related(parts[0], word)) && parts.length > 3) {
      parts = parts.slice(1);
      continue;
    }
    break;
  }
  text = parts.join(" ").replace(/^[,:;.-]+\s*/, "").replace(/^(?:is|was|are|were)\s+/i, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return quote.replace(/\s+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function clipFact(text: string, limit = GEM_LIMIT): { text: string; clipped: boolean } {
  if (text.length <= limit) return { text, clipped: false };
  const slice = text.slice(0, limit);
  const end = slice.lastIndexOf(" ");
  const trimmed = (end > 80 ? slice.slice(0, end) : slice).trimEnd();
  return { text: `${trimmed}...`, clipped: true };
}
