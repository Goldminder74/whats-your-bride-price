import { regions, type RegionKey } from "./gameData.ts";
import { legacyImageQuestionStableId } from "./imageQuestionPresentation.ts";

export type ImageAnswerJudgement = Readonly<{
  correct: boolean;
  correctOptionIds: readonly string[];
  explanation: string;
}>;

const authority = new Map<string, Readonly<{
  region: RegionKey;
  optionCount: number;
  correctOptionIds: readonly string[];
  explanation: string;
}>>();

for (const [region, catalogue] of Object.entries(regions) as [RegionKey, (typeof regions)[RegionKey]][]) {
  for (const [questionIndex, question] of catalogue.questions.entries()) {
    if (question.kind !== "image") continue;
    authority.set(legacyImageQuestionStableId(region, questionIndex), Object.freeze({
      region,
      optionCount: question.options.length,
      correctOptionIds: Object.freeze(question.correct.map((index) => `o${index + 1}`)),
      explanation: question.explanation,
    }));
  }
}

export function judgeImageAnswer(stableId: string, selectedOptionIds: readonly string[]): ImageAnswerJudgement | null {
  const question = authority.get(stableId);
  if (!question || selectedOptionIds.length !== 1 || new Set(selectedOptionIds).size !== selectedOptionIds.length) return null;
  if (selectedOptionIds.some((id) => !/^o[1-4]$/.test(id) || Number(id.slice(1)) > question.optionCount)) return null;
  const correct = selectedOptionIds.length === question.correctOptionIds.length
    && selectedOptionIds.every((id, index) => id === question.correctOptionIds[index]);
  return Object.freeze({ correct, correctOptionIds: question.correctOptionIds, explanation: question.explanation });
}

export const imageAnswerAuthorityQuestionCount = authority.size;
