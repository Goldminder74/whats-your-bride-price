import { CowrieWalletService, D1CowrieWalletRepository } from "../db/cowrieWallet.ts";
import { D1QuestionSelectionRepository } from "../db/questionSelection.ts";
import { activeFeatureFlags } from "./featureFlags.ts";

declare const __WYBP_REVIEW_COWRIE_FIXTURES__: boolean | undefined;

export async function getCowrieRuntime(): Promise<CowrieWalletService | null> {
  if (typeof __WYBP_REVIEW_COWRIE_FIXTURES__ === "boolean" && __WYBP_REVIEW_COWRIE_FIXTURES__) {
    return (await import("./cowrieReviewRuntime.ts")).getCowrieReviewRuntime();
  }
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as { DB?: D1Database };
  if (!runtime.DB) return null;
  const selection = new D1QuestionSelectionRepository(runtime.DB);
  return new CowrieWalletService(new D1CowrieWalletRepository(runtime.DB, selection), { streaksEnabled: activeFeatureFlags.streaks && activeFeatureFlags.daily_challenge });
}
