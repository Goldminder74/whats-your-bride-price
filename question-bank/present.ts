import type { RegionKey } from "../app/gameData.ts";
import type { PlayQuestion } from "./types.ts";

export type PublicRoundQuestion = {
  index: number;
  id: string;
  kind: PlayQuestion["kind"];
  prompt: string;
  options: string[];
  topic: string;
  image: string | null;
  images: string[] | null;
};

export function toPublicQuestion(question: PlayQuestion, index: number, edition: RegionKey): PublicRoundQuestion {
  const visual = question.visualStart;
  return {
    index,
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    options: [...question.options],
    topic: question.topic,
    image: visual === undefined ? null : `/quiz-art/${edition}-${visual}.webp`,
    images: visual === undefined ? null : question.options.map((_, optionIndex) => `/quiz-art/${edition}-${visual + optionIndex}.webp`),
  };
}
