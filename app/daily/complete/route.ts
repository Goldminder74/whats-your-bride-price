import { DailyChallengeError } from "../../../db/dailyChallenge.ts";
import { getDailyChallengeRuntime } from "../../dailyChallengeRuntime.ts";
import { dailyJson, readDailyJson, safeDailyRequest } from "../../dailyHttp.ts";
import { activeFeatureFlags } from "../../featureFlags.ts";
import { getCowrieRuntime } from "../../cowrieRuntime.ts";

export async function POST(request: Request): Promise<Response> {
  if (!activeFeatureFlags.daily_challenge) return dailyJson({ completed: false }, 404);
  if (!safeDailyRequest(request)) return dailyJson({ completed: false }, 403);
  try {
    const runtime = await getDailyChallengeRuntime();
    if (!runtime) return dailyJson({ completed: false }, 503);
    const raw = await readDailyJson(request);
    const candidate = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    const walletCredential = candidate?.cowrieOwnerCredential;
    if (walletCredential !== undefined && (!activeFeatureFlags.cowrie_economy || !activeFeatureFlags.random_quick_play || typeof walletCredential !== "string" || !/^[0-9a-f]{32}$/.test(walletCredential))) return dailyJson({ completed: false }, 400);
    const body = candidate ? { ...candidate } : raw;
    if (candidate) delete (body as Record<string, unknown>).cowrieOwnerCredential;
    const completion = await runtime.complete(body);
    if (completion.official && activeFeatureFlags.streaks && typeof walletCredential === "string" && typeof candidate?.anonymousSessionCredential === "string") {
      // A failed bonus write leaves the authoritative daily result intact. The
      // same completion may be retried to reconcile the unique award safely.
      try { await (await getCowrieRuntime())?.awardOfficialDaily(walletCredential, candidate.anonymousSessionCredential); }
      catch { return dailyJson({ completed: true, ...completion, cowrieAward: "unavailable" }, 201); }
    }
    return dailyJson({ completed: true, ...completion }, 201);
  } catch (error) {
    if (error instanceof DailyChallengeError) {
      const status = error.code.includes("rate_limited") ? 429 : error.code.includes("unavailable") ? 503 : error.code.includes("conflict") ? 409 : 400;
      return dailyJson({ completed: false }, status);
    }
    return dailyJson({ completed: false }, 400);
  }
}
