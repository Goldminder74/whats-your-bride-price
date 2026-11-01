import { activeFeatureFlags } from "../../../featureFlags";
import { getReviewChallengeRuntime } from "../../../challengeReviewRuntime";
import {
  ChallengeCompletionError,
  isSafeChallengeComparisonProjection,
} from "../../../../db/challengeCompletion";

const unavailableMessage = "This comparison is not available.";
const temporaryMessage = "We could not confirm this comparison right now. Please try again.";

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function sameOrigin(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === requestUrl.origin && (!fetchSite || fetchSite === "same-origin");
}

type CompletionRouteContext = Readonly<{
  params: Promise<{ code: string }> | { code: string };
}>;

export async function POST(request: Request, context: CompletionRouteContext): Promise<Response> {
  const { code } = await Promise.resolve(context.params);
  if (!/^[0-9a-f]{48}$/.test(code) || !activeFeatureFlags.challenges) {
    return json({ completed: false, message: unavailableMessage }, 404);
  }
  if (!sameOrigin(request)) return json({ completed: false, message: temporaryMessage }, 403);
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) return json({ completed: false, message: temporaryMessage }, 415);
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > 16_384) return json({ completed: false, message: temporaryMessage }, 413);
  const raw = await request.text();
  if (!raw || raw.length > 16_384) return json({ completed: false, message: temporaryMessage }, 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ completed: false, message: temporaryMessage }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ completed: false, message: temporaryMessage }, 400);
  const candidate = body as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(",") !== "anonymousSubjectHash,answers,idempotencyKey") {
    return json({ completed: false, message: temporaryMessage }, 400);
  }
  const runtime = getReviewChallengeRuntime();
  if (!runtime) return json({ completed: false, message: unavailableMessage }, 404);
  try {
    const comparison = await runtime.completionService.complete({
      publicCode: code,
      anonymousSubjectHash: candidate.anonymousSubjectHash,
      idempotencyKey: candidate.idempotencyKey,
      answers: candidate.answers,
    });
    if (!isSafeChallengeComparisonProjection(comparison)) throw new Error("unsafe_projection");
    return json({ completed: true, comparison }, 200);
  } catch (error) {
    if (error instanceof ChallengeCompletionError) {
      if (["challenge_attempt_unavailable", "invalid_challenge_code", "invalid_anonymous_subject", "storage_unavailable"].includes(error.code)) {
        return json({ completed: false, message: unavailableMessage }, 404);
      }
      if (["invalid_answers", "invalid_idempotency_key"].includes(error.code)) {
        return json({ completed: false, message: temporaryMessage }, 400);
      }
    }
    return json({ completed: false, message: temporaryMessage }, 503);
  }
}
