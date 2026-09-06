import { DailyChallengeError } from "../../../db/dailyChallenge.ts";
import { getDailyChallengeRuntime } from "../../dailyChallengeRuntime.ts";
import { dailyJson, readDailyJson, safeDailyRequest } from "../../dailyHttp.ts";
import { activeFeatureFlags } from "../../featureFlags.ts";

export async function POST(request: Request): Promise<Response> {
  if (!activeFeatureFlags.daily_challenge) return dailyJson({ completed: false }, 404);
  if (!safeDailyRequest(request)) return dailyJson({ completed: false }, 403);
  try {
    const runtime = await getDailyChallengeRuntime();
    if (!runtime) return dailyJson({ completed: false }, 503);
    return dailyJson({ completed: true, ...(await runtime.complete(await readDailyJson(request))) }, 201);
  } catch (error) {
    if (error instanceof DailyChallengeError) {
      const status = error.code.includes("rate_limited") ? 429 : error.code.includes("unavailable") ? 503 : error.code.includes("conflict") ? 409 : 400;
      return dailyJson({ completed: false }, status);
    }
    return dailyJson({ completed: false }, 400);
  }
}
