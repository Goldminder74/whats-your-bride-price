import { privateTestProfile, privateTestRuntimeReady } from "./privateTestProfile.ts";
import { D1QuestionSelectionRepository } from "../db/questionSelection.ts";
import { QuestionSelectionService } from "../db/questionSelectionService.ts";
import { applicationAuthorityDatabase } from "../db/authorityDatabase.ts";

declare const __WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES__: boolean | undefined;

export async function getQuestionSelectionRuntime(): Promise<QuestionSelectionService | null> {
  if (typeof __WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES__ === "boolean" && __WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES__) {
    return (await import("./randomQuickPlayReviewRuntime.ts")).getRandomQuickPlayReviewRuntime();
  }
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, unknown> & { DB?: D1Database };
  if (privateTestProfile !== "off" && !privateTestRuntimeReady(runtime)) return null;
  const database = applicationAuthorityDatabase(runtime, privateTestProfile !== "off");
  return database ? new QuestionSelectionService(new D1QuestionSelectionRepository(database)) : null;
}
