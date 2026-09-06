import { D1QuestionSelectionRepository } from "../db/questionSelection.ts";
import { QuestionSelectionService } from "../db/questionSelectionService.ts";

export async function getQuestionSelectionRuntime(): Promise<QuestionSelectionService | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as { DB?: D1Database };
  return runtime.DB ? new QuestionSelectionService(new D1QuestionSelectionRepository(runtime.DB)) : null;
}
