import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("owner-dashboard-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function request(pathname, options = {}) {
  const built = await worker();
  return built.fetch(new Request(`http://localhost${pathname}`, options), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

const trustedHeaders = { accept: "text/html", "oai-authenticated-user-id": "review-owner", "oai-authenticated-user-email": "review@example.invalid" };

test("ordinary production output keeps the dashboard disabled and query parameters cannot enable it", async () => {
  if (process.env.WYBP_REVIEW_BUILD === "true") return;
  const response = await request("/owner/analytics?owner_dashboard=true&fixture=healthy&mode=solo", { headers: trustedHeaders });
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /Funnel & viral coefficient|Private owner workspace/);
});

test("ordinary production client assets contain no allowlist or review fixture payload", async () => {
  if (process.env.WYBP_REVIEW_BUILD === "true") return;
  const clientRoot = new URL("../dist/client/", import.meta.url);
  const names = await readdir(clientRoot, { recursive: true });
  const text = (await Promise.all(names.filter((name) => /\.(?:js|html|json|css)$/.test(name)).map(async (name) => readFile(new URL(name.replaceAll("\\", "/"), clientRoot), "utf8")))).join("\n");
  assert.doesNotMatch(text, /WYBP_OWNER_DASHBOARD_ALLOWED_SUBJECTS|review-owner|at_target|channel_comparison|ownerDashboardReviewSnapshot/);
});

test("review dashboard denies missing and unknown trusted identities with a neutral response", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  for (const headers of [{ accept: "text/html" }, { ...trustedHeaders, "oai-authenticated-user-id": "unknown-owner" }]) {
    const response = await request("/owner/analytics?fixture=d1_unavailable", { headers });
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.doesNotMatch(html, /Private owner workspace|Analytics data is unavailable|allowlist|review-owner/);
  }
});

test("authorised review dashboard is private, non-cacheable and contains aggregate-only content", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  const response = await request("/owner/analytics?fixture=at_target", { headers: trustedHeaders });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const html = await response.text();
  assert.match(html, /Consented measured traffic only\. This dashboard does not represent all players\./);
  assert.match(html, /2\.5/); assert.match(html, /45%/); assert.match(html, /1\.125/);
  assert.match(html, /Unsupported by the current analytics data contract/);
  assert.doesNotMatch(html, /review-owner|review@example|analytics_session_hash|properties_json|client_event_uuid|challenge_code|result_id|stripe|order_reference/i);
});

test("source, edition and surface cannot appear as a manufactured game-mode control", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  const response = await request("/owner/analytics?fixture=healthy&edition=west&source=challenge", { headers: trustedHeaders });
  assert.equal(response.status, 200); const html = await response.text();
  assert.doesNotMatch(html, /name="mode"|name="game_mode"|game mode:\s*(?:solo|west|challenge|entry|quiz)/i);
  assert.match(html, /Game mode/); assert.match(html, /Unsupported by the current analytics data contract/);
});

test("malformed and SQL-shaped dashboard filters are rejected", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  for (const path of [
    "/owner/analytics?from=2026-01-01&to=2026-08-27",
    "/owner/analytics?edition=west%27%20OR%201%3D1--",
    "/owner/analytics?sort=count%20desc",
    "/owner/analytics?mode=solo",
  ]) assert.equal((await request(path, { headers: trustedHeaders })).status, 404);
});

test("D1-unavailable state is authorised, honest and infrastructure-neutral", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  const response = await request("/owner/analytics?fixture=d1_unavailable", { headers: trustedHeaders });
  assert.equal(response.status, 200); const html = await response.text();
  assert.match(html, /Analytics data is unavailable/); assert.match(html, /failed closed/);
  assert.doesNotMatch(html, /owner-summary-title|owner-funnel-title/);
  const visibleText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(visibleText, /D1|binding|Cloudflare|database error|stack/i);
});

test("aggregate CSV requires same-origin Fetch Metadata and the same trusted owner authorization", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  const baseHeaders = { ...trustedHeaders, "sec-fetch-site": "same-origin" };
  assert.equal((await request("/owner/analytics/export?fixture=healthy", { headers: { "sec-fetch-site": "same-origin" } })).status, 404);
  assert.equal((await request("/owner/analytics/export?fixture=healthy", { headers: { ...baseHeaders, "oai-authenticated-user-id": "unknown-owner" } })).status, 404);
  assert.equal((await request("/owner/analytics/export?fixture=healthy", { headers: trustedHeaders })).status, 404);
  const response = await request("/owner/analytics/export?fixture=healthy&edition=west", { headers: baseHeaders });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(response.headers.get("content-disposition") || "", /attachment; filename="wybp-aggregate-report\.csv"/);
  assert.match(response.headers.get("cache-control") || "", /private.*no-store/);
  const csv = await response.text();
  assert.match(csv, /edition: west/); assert.match(csv, /"dimension","gameMode"/);
  assert.doesNotMatch(csv, /analytics_session_hash|properties_json|review-owner|client_event_uuid|raw event/i);
});
