import { QuestionSelectionService, type QuestionSelectionRepository } from "../db/questionSelectionService.ts";
import type { QuestionSelection, SelectableQuestion, StoredQuestionSelection } from "../db/questionSelection.ts";
import type { RegionKey } from "./publicGameData.ts";

type Stored = Readonly<{ owner: string; idempotencyHash: string; value: StoredQuestionSelection }>;
const attempts = new Map<string, Stored>();
const byIdempotency = new Map<string, Stored>();
const regionNames: Record<RegionKey, string> = { west: "West", east: "East", central: "Central", north: "North", south: "Southern" };

function candidates(region: RegionKey): readonly SelectableQuestion[] {
  return Object.freeze(Array.from({ length: 30 }, (_, index) => {
    const image = index === 7;
    const stableId = `${region}_review_${String(index + 1).padStart(2, "0")}`;
    const answerOptions = image
      ? ["An image answer one", "An image answer two", "An image answer three", "An image answer four"]
      : ["A thoughtful first choice", "A confident second choice", "A curious third choice", "A generous fourth choice"];
    return Object.freeze({
      internalId: `review_${stableId}`, editionId: `edition_${region}_review`, stableId, version: 1, region,
      category: ["HISTORY", "FOOD", "MUSIC", "ART", "GEOGRAPHY"][index % 5],
      difficulty: ["introductory", "intermediate", "advanced"][index % 3] as "introductory" | "intermediate" | "advanced",
      questionKind: image ? "image" as const : "single" as const,
      questionText: image ? `Which reviewed image belongs in this ${regionNames[region]} Africa practice fixture?` : `${regionNames[region]} Africa review question ${index + 1}: which response feels right?`,
      visualStart: image ? 0 : null,
      answerOptions: Object.freeze(answerOptions.map((text, optionIndex) => Object.freeze({ id: `o${optionIndex + 1}`, text }))),
      acceptedAnswers: Object.freeze([Object.freeze([`o${(index % 4) + 1}`])]),
      explanation: `This is authorised review-fixture explanation ${index + 1}; it is excluded from ordinary builds.`,
      scoringWeight: 1, lifecycleStatus: "published" as const, sourceReviewStatus: "approved" as const,
      publishedAt: 1, retiredAt: null, validFrom: 1, validUntil: null,
      imageProvenance: image ? Object.freeze([0, 1, 2, 3].map((optionIndex) => Object.freeze({
        assetRef: `/quiz-art/${region}-${optionIndex}.webp`,
        accessibilityDescription: `A neutral review illustration with geometric shapes and colour arrangement number ${optionIndex + 1}.`,
        creator: "Authorised review fixture", source: "https://example.org/review-fixture", licence: "Review only", reviewedAt: "2026-09-09",
      }))) : Object.freeze([]),
      audioProvenance: Object.freeze([]),
    });
  }));
}

const repository: QuestionSelectionRepository = {
  storageAvailable: true,
  async getCandidates(region) { return candidates(region); },
  async getRecentQuestionVersions() { return []; },
  async getAttemptByIdempotencyHash(hash, owner, now) {
    const stored = byIdempotency.get(hash);
    return stored && stored.owner === owner && stored.value.expiresAt > now ? stored.value : null;
  },
  async getAttempt(id, owner, now) {
    const stored = attempts.get(id);
    return stored && stored.owner === owner && stored.value.expiresAt > now ? stored.value : null;
  },
  async createAttempt(input) {
    if (byIdempotency.has(input.idempotencyKeyHash)) return false;
    const value = Object.freeze({ attemptId: input.id, region: input.selection.questions[0].region, expiresAt: input.expiresAt, selection: input.selection as QuestionSelection });
    const stored = Object.freeze({ owner: input.anonymousSubjectHash, idempotencyHash: input.idempotencyKeyHash, value });
    attempts.set(input.id, stored); byIdempotency.set(input.idempotencyKeyHash, stored);
    return true;
  },
  async judgeAttemptAnswer(id, owner, questionRef, selectedOptionIds, now) {
    const stored = attempts.get(id);
    if (!stored || stored.owner !== owner || stored.value.expiresAt <= now) return null;
    const question = stored.value.selection.questions.find((item) => item.stableId === questionRef);
    if (!question || selectedOptionIds.some((id) => !question.answerOptions.some((option) => option.id === id))) return null;
    const selected = [...selectedOptionIds].sort();
    const correct = question.acceptedAnswers.some((answer) => answer.length === selected.length && [...answer].sort().every((id, index) => id === selected[index]));
    return Object.freeze({ correct, correctOptionIds: question.acceptedAnswers[0], explanation: question.explanation });
  },
  async consumeRateLimit() { return "allowed"; },
};

export function getRandomQuickPlayReviewRuntime(): QuestionSelectionService {
  return new QuestionSelectionService(repository);
}
