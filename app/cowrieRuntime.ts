import { privateTestProfile, privateTestRuntimeReady } from "./privateTestProfile.ts";
import { CowrieWalletService, D1CowrieWalletRepository } from "../db/cowrieWallet.ts";
import { D1QuestionSelectionRepository } from "../db/questionSelection.ts";
import { activeFeatureFlags } from "./featureFlags.ts";
import { applicationAuthorityDatabase } from "../db/authorityDatabase.ts";

declare const __WYBP_REVIEW_COWRIE_FIXTURES__: boolean | undefined;

export async function getCowrieRuntime(): Promise<CowrieWalletService | null> {
  if (typeof __WYBP_REVIEW_COWRIE_FIXTURES__ === "boolean" && __WYBP_REVIEW_COWRIE_FIXTURES__) {
    return (await import("./cowrieReviewRuntime.ts")).getCowrieReviewRuntime();
  }
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, unknown> & { DB?: D1Database };
  if (!runtime.DB || (privateTestProfile !== "off" && !privateTestRuntimeReady(runtime))) return null;
  const database = applicationAuthorityDatabase(runtime, privateTestProfile !== "off");
  if (!database) return null;
  const selection = new D1QuestionSelectionRepository(database);
  return new CowrieWalletService(new D1CowrieWalletRepository(database, selection), { streaksEnabled: activeFeatureFlags.streaks && activeFeatureFlags.daily_challenge });
}
