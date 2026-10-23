import { activeFeatureFlags } from "../../../featureFlags";
import { getReviewChallengeRuntime } from "../../../challengeReviewRuntime";
import {
  ChallengeAcceptanceError,
  isChallengePublicCode,
} from "../../../../db/challengeAcceptance";

const neutralUnavailable = "This challenge is no longer available.";
const temporaryFailure = "We could not confirm acceptance right now. Please try again.";

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function safeSameOriginRequest(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === requestUrl.origin && (!fetchSite || fetchSite === "same-origin");
}

type AcceptanceRouteContext = Readonly<{
  params: Promise<{ code: string }> | { code: string };
}>;

export async function POST(request: Request, context: AcceptanceRouteContext): Promise<Response> {
  const { code } = await Promise.resolve(context.params);
  if (!isChallengePublicCode(code) || !activeFeatureFlags.challenges) {
    return json({ accepted: false, message: neutralUnavailable }, 404);
  }
  if (!safeSameOriginRequest(request)) {
    return json({ accepted: false, message: temporaryFailure }, 403);
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    return json({ accepted: false, message: temporaryFailure }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > 1_024) {
    return json({ accepted: false, message: temporaryFailure }, 413);
  }
  const raw = await request.text();
  if (!raw || raw.length > 1_024) return json({ accepted: false, message: temporaryFailure }, 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ accepted: false, message: temporaryFailure }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ accepted: false, message: temporaryFailure }, 400);
  }
  const candidate = body as Record<string, unknown>;
  const fields = Object.keys(candidate).sort();
  if (fields.length !== 2 || fields[0] !== "anonymousSubjectHash" || fields[1] !== "idempotencyKey") {
    return json({ accepted: false, message: temporaryFailure }, 400);
  }

  const runtime = getReviewChallengeRuntime();
  if (!runtime) return json({ accepted: false, message: neutralUnavailable }, 404);
  try {
    const currentChallenge = await runtime.challengeService.getPublic(code);
    if (currentChallenge?.status !== "active") {
      return json({ accepted: false, message: neutralUnavailable }, 404);
    }
    const accepted = await runtime.acceptanceService.accept({
      publicCode: code,
      idempotencyKey: candidate.idempotencyKey,
      anonymousSubjectHash: candidate.anonymousSubjectHash,
    });
    return json(accepted, 200);
  } catch (error) {
    if (error instanceof ChallengeAcceptanceError) {
      if (["challenge_unavailable", "invalid_challenge_code", "storage_unavailable"].includes(error.code)) {
        return json({ accepted: false, message: neutralUnavailable }, 404);
      }
      if (error.code === "rate_limited") return json({ accepted: false, message: error.publicMessage }, 429);
    }
    return json({ accepted: false, message: temporaryFailure }, 503);
  }
}
