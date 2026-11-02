import { regions, type Question, type RegionKey } from "../app/gameData.ts";
import type { BankDifficulty, BankQuestion } from "./types.ts";

const CATEGORY: Record<string, string> = {
  PROVERBS: "PROVERBS",
  LANGUAGE: "LANGUAGE",
  "PEOPLES & LANGUAGE": "LANGUAGE",
  HISTORY: "HISTORY",
  "MODERN HISTORY": "HISTORY",
  "ART & HISTORY": "HISTORY",
  "ORAL HISTORY": "HISTORY",
  SYMBOLS: "HISTORY",
  PHILOSOPHY: "PROVERBS",
  FOOD: "FOOD",
  TEXTILES: "FASHION",
  ART: "FASHION",
  MUSIC: "MUSIC",
  GEOGRAPHY: "GEOGRAPHY",
  TRADITION: "FESTIVALS",
};

const DIFFICULTY: BankDifficulty[] = ["easy", "medium", "hard"];

const COUNTRY: Record<RegionKey, string> = {
  west: "West Africa",
  east: "East Africa",
  central: "Central Africa",
  north: "North Africa",
  south: "Southern Africa",
};

function classicQuestion(region: RegionKey, question: Question, index: number): BankQuestion {
  const number = String(index).padStart(2, "0");
  return {
    id: `${region}_classic_${number}`,
    region,
    country: COUNTRY[region],
    category: CATEGORY[question.topic] || "HISTORY",
    difficulty: DIFFICULTY[index % 3],
    kind: question.kind,
    prompt: question.prompt,
    options: [...question.options],
    correct: [...question.correct],
    explanation: question.explanation,
    sources: [{
      title: "What's Your Bride Price classic edition",
      url: "https://www.unesco.org/en/general-history-africa",
      claim: question.explanation,
      method: "manual",
    }],
    origin: "classic",
    orderMatters: question.kind === "image",
    visualStart: question.visualStart,
    lifecycleStatus: "published",
  };
}

export function classicBank(region?: RegionKey): BankQuestion[] {
  const keys = region ? [region] : (Object.keys(regions) as RegionKey[]);
  return keys.flatMap((key) => regions[key].questions.map((question, index) => classicQuestion(key, question, index)));
}

export const classicIds = (region: RegionKey) => classicBank(region).map((question) => question.id);
