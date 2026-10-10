import type {
  ChallengeAnswerSubmission,
  ChallengeComparisonProjection,
} from "../db/challengeCompletion.ts";
import { regions, type RegionKey } from "./publicGameData.ts";

export interface ChallengeCompletionClient {
  readonly storageAvailable: boolean;
  complete(answers: readonly ChallengeAnswerSubmission[]): Promise<ChallengeComparisonProjection>;
}

export function buildChallengeAnswerSubmission(
  edition: RegionKey,
  answerChoices: readonly (readonly number[])[],
): readonly ChallengeAnswerSubmission[] {
  if (answerChoices.length !== regions[edition].questions.length) return Object.freeze([]);
  return Object.freeze(answerChoices.map((choice, questionIndex) => Object.freeze({
    questionStableId: `${edition}_q${String(questionIndex + 1).padStart(2, "0")}`,
    selectedOptionIds: Object.freeze(choice.map((optionIndex) => `o${optionIndex + 1}`)),
  })));
}
