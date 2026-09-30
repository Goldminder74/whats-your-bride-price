import { DailyChallengeError } from "../../../db/dailyChallenge.ts";
import { getDailyChallengeRuntime } from "../../dailyChallengeRuntime.ts";
import { dailyJson, readDailyJson, safeDailyRequest } from "../../dailyHttp.ts";
import { activeFeatureFlags } from "../../featureFlags.ts";

export async function POST(request: Request): Promise<Response> {
  if (!activeFeatureFlags.daily_challenge) return dailyJson({ available: false }, 404);
  if (!safeDailyRequest(request)) return dailyJson({ available: false }, 403);
  try {
    const runtime = await getDailyChallengeRuntime();
    if (!runtime) return dailyJson({ available: false }, 503);
    return dailyJson({ available: true, ...(await runtime.start(await readDailyJson(request))) }, 201);
  } catch (error) {
    if (error instanceof DailyChallengeError) {
      const status = error.code.includes("rate_limited") ? 429 : error.code.includes("unavailable") || error.code.includes("secret") ? 503 : error.code.includes("conflict") ? 409 : 400;
      return dailyJson({ available: false }, status);
    }
    return dailyJson({ available: false }, 400);
  }
}
