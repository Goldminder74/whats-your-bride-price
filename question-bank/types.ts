import type { QuestionKind, RegionKey } from "../app/gameData.ts";

export type BankDifficulty = "easy" | "medium" | "hard";
export type BankOrigin = "classic" | "draft" | "generated";
export type SupportMethod = "evidence-quote" | "page-overlap" | "manual";

export type BankSource = {
  title: string;
  url: string;
  claim: string;
  method?: SupportMethod;
};

export type GateCheck = "pass" | "fail";

export type GateReport = {
  schema: GateCheck;
  answerKey: GateCheck;
  options: GateCheck;
  source: { status: GateCheck; method: SupportMethod | "unchecked"; http: number | null };
  duplicate: GateCheck;
  sensitivity: GateCheck;
  ambiguity: GateCheck;
  region: GateCheck;
  reasons: string[];
  evidenceQuote: string | null;
  editorial: { clarity: number; fun: number; accuracy: number; method: "editorial-rules" };
};

export type BankQuestion = {
  id: string;
  region: RegionKey;
  country: string;
  category: string;
  difficulty: BankDifficulty;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  correct: number[];
  explanation: string;
  sources: BankSource[];
  origin: BankOrigin;
  sensitivityNotes?: string | null;
  orderMatters?: boolean;
  visualStart?: number;
  lifecycleStatus?: "published" | "held";
  gateReport?: GateReport;
};

export type PlayQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  correct: number[];
  explanation: string;
  topic: string;
  difficulty: BankDifficulty;
  category: string;
  orderMatters: boolean;
  visualStart?: number;
};

export type PublishedFile = {
  region: RegionKey;
  questions: BankQuestion[];
};

export const FUN_CATEGORIES = [
  "FOOD",
  "PROVERBS",
  "MUSIC",
  "FASHION",
  "LANGUAGE",
  "FESTIVALS",
  "WEDDINGS",
  "GEOGRAPHY",
  "HISTORY",
  "PEOPLE",
  "POP",
  "SPORT",
  "HUMOUR",
] as const;

export const HUMOUR_CATEGORY = "HUMOUR";
export const GAME_SIZE = 12;
/** Humour punchlines in a standard 12-question round. The rest stay knowledge questions. */
export const ROUND_HUMOUR = 8;
export const ROUND_KNOWLEDGE = GAME_SIZE - ROUND_HUMOUR;
export const RECENT_AVOID = 24;
export const RECENT_KEEP = 100;
