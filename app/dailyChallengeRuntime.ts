import { DailyChallengeService, D1DailyChallengeRepository } from "../db/dailyChallenge.ts";
import { activeFeatureFlags } from "./featureFlags.ts";

export async function getDailyChallengeRuntime(): Promise<DailyChallengeService | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as { DB?: D1Database; WYBP_DAILY_SECRET?: string };
  if (!runtime.DB || !runtime.WYBP_DAILY_SECRET) return null;
  return new DailyChallengeService(new D1DailyChallengeRepository(runtime.DB), {
    secret: runtime.WYBP_DAILY_SECRET,
    streaksEnabled: activeFeatureFlags.streaks,
  });
}
