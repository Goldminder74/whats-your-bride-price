import { D1QuestionBankRepository } from "../db/questionBankRepository.ts";

export async function getQuestionBankRuntime(): Promise<D1QuestionBankRepository | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as { DB?: D1Database };
  return runtime.DB ? new D1QuestionBankRepository(runtime.DB) : null;
}
