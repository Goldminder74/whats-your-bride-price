import { activeFeatureFlags } from "../../../featureFlags.ts";
import { getOwnerDashboardAccess, safeOwnerDashboardExportRequest } from "../../../ownerDashboardAuth.ts";
import { getOwnerDashboardExportRateLimiter } from "../../../ownerDashboardExportRateLimit.ts";
import { getOwnerDashboardRuntime, ownerDashboardReviewFixturesEnabled } from "../../../ownerDashboardRuntime.ts";
import { buildOwnerDashboardReport, ownerDashboardCsv, OwnerDashboardValidationError, parseOwnerDashboardFilters } from "../../../../db/ownerDashboard.ts";

const securityHeaders = Object.freeze({
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function denied(status = 404): Response {
  return new Response(null, { status, headers: securityHeaders });
}

export async function GET(request: Request): Promise<Response> {
  if (!activeFeatureFlags.owner_dashboard || !safeOwnerDashboardExportRequest(request)) return denied();
  const access = await getOwnerDashboardAccess();
  if (!access.authorized || !access.identity) return denied();
  const limiter = getOwnerDashboardExportRateLimiter();
  if (!limiter) return denied(503);
  const decision = await limiter.consume(access.identity.subject, Date.now());
  if (decision !== "allowed") return denied(decision === "limited" ? 429 : 503);
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)) return denied(400);
  const fixture = ownerDashboardReviewFixturesEnabled ? raw.fixture : undefined;
  delete raw.fixture;
  try {
    const filters = parseOwnerDashboardFilters(raw);
    const runtime = await getOwnerDashboardRuntime(fixture);
    if (!runtime) return denied(503);
    const report = buildOwnerDashboardReport(await runtime.repository.aggregate(filters, Date.now()), filters, Date.now(), runtime.commerceEnabled);
    return new Response(ownerDashboardCsv(report), { status: 200, headers: {
      ...securityHeaders,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=\"wybp-aggregate-report.csv\"",
    } });
  } catch (error) {
    return denied(error instanceof OwnerDashboardValidationError ? 400 : 503);
  }
}
