import { D1QuestionSelectionRepository } from "../db/questionSelection.ts";
import { QuestionSelectionService } from "../db/questionSelectionService.ts";

declare const __WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES__: boolean | undefined;

export async function getQuestionSelectionRuntime(): Promise<QuestionSelectionService | null> {
  if (typeof __WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES__ === "boolean" && __WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES__) {
    return (await import("./randomQuickPlayReviewRuntime.ts")).getRandomQuickPlayReviewRuntime();
  }
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as { DB?: D1Database };
  return runtime.DB ? new QuestionSelectionService(new D1QuestionSelectionRepository(runtime.DB)) : null;
}
