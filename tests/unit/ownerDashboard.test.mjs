import assert from "node:assert/strict";
import test from "node:test";
import { authorizeOwnerDashboardSubject, parseOwnerDashboardAllowlist } from "../../app/ownerDashboardAccess.ts";
import { assertOwnerDashboardReadiness, defaultFeatureFlags, resolveFeatureFlags } from "../../app/featureFlags.ts";
import { validateAnalyticsProperties } from "../../db/analytics.ts";
import {
  buildOwnerDashboardReport,
  emptyOwnerDashboardSnapshot,
  ownerDashboardCsv,
  ownerDashboardFilterSummary,
  parseOwnerDashboardFilters,
} from "../../db/ownerDashboard.ts";
import { ownerDashboardReviewSnapshot } from "../../app/ownerDashboardReview.ts";

const now = Date.UTC(2026, 7, 27, 12);
const filters = () => parseOwnerDashboardFilters({ from: "2026-08-21", to: "2026-08-27" }, now);
const report = (scenario = "healthy", selected = filters()) => buildOwnerDashboardReport(ownerDashboardReviewSnapshot(scenario), selected, now, false);

test("owner dashboard is disabled by default and query-shaped environment keys cannot enable it", () => {
  assert.equal(defaultFeatureFlags.owner_dashboard, false);
  assert.equal(resolveFeatureFlags({ owner_dashboard: "true", query: "owner_dashboard=1" }).owner_dashboard, false);
  assert.equal(resolveFeatureFlags({ WYBP_FEATURE_OWNER_DASHBOARD: "true" }).owner_dashboard, true);
});

test("production dashboard readiness fails closed without D1 and owner access configuration", () => {
  const flags = resolveFeatureFlags({ WYBP_FEATURE_OWNER_DASHBOARD: "true" });
  assert.throws(() => assertOwnerDashboardReadiness(flags, { d1Configured: false, ownerAccessConfigured: false, authorisedReviewFixtures: false }), /fails closed/i);
  assert.throws(() => assertOwnerDashboardReadiness(flags, { d1Configured: true, ownerAccessConfigured: false, authorisedReviewFixtures: false }), /allowlist/i);
  assert.doesNotThrow(() => assertOwnerDashboardReadiness(flags, { d1Configured: true, ownerAccessConfigured: true, authorisedReviewFixtures: false }));
  assert.doesNotThrow(() => assertOwnerDashboardReadiness(flags, { d1Configured: false, ownerAccessConfigured: false, authorisedReviewFixtures: true }));
});

test("missing, empty, duplicate and malformed owner allowlists deny access", () => {
  for (const value of [undefined, "", " ", "owner,owner", "owner, bad subject", ",owner"]) assert.equal(parseOwnerDashboardAllowlist(value), null);
  assert.deepEqual([...parseOwnerDashboardAllowlist("owner-a,owner_b")], ["owner-a", "owner_b"]);
});

test("unauthenticated and unknown authenticated subjects are denied", () => {
  assert.deepEqual(authorizeOwnerDashboardSubject(null, "owner-a"), { authorized: false, identity: null });
  assert.deepEqual(authorizeOwnerDashboardSubject("owner-b", "owner-a"), { authorized: false, identity: null });
  assert.deepEqual(authorizeOwnerDashboardSubject("owner-a", undefined), { authorized: false, identity: null });
});

test("a stable trusted subject succeeds only when explicitly allowlisted", () => {
  assert.deepEqual(authorizeOwnerDashboardSubject("owner-a", "owner-a,owner-b"), { authorized: true, identity: { subject: "owner-a" } });
});

test("date filters default to the latest seven inclusive UTC days", () => {
  const value = parseOwnerDashboardFilters({}, now);
  assert.deepEqual({ from: value.fromDate, to: value.toDate, timezone: value.timezone }, { from: "2026-08-21", to: "2026-08-27", timezone: "UTC" });
  assert.equal((value.toExclusive - value.from) / 86_400_000, 7);
});

test("date filters reject malformed, future, reversed and greater-than-30-day ranges", () => {
  for (const value of [
    { from: "2026-02-30", to: "2026-03-01" }, { from: "2026-08-28", to: "2026-08-28" },
    { from: "2026-08-27", to: "2026-08-21" }, { from: "2026-07-01", to: "2026-08-27" },
  ]) assert.throws(() => parseOwnerDashboardFilters(value, now));
});

test("edition, source and campaign filters accept only controlled values", () => {
  const value = parseOwnerDashboardFilters({ edition: "east", source: "challenge", campaign: "nomination" }, now);
  assert.deepEqual({ edition: value.edition, source: value.source, campaign: value.campaign }, { edition: "east", source: "challenge", campaign: "nomination" });
  for (const value of [{ edition: "east' OR 1=1--" }, { source: "utm-anything" }, { campaign: "=cmd" }]) assert.throws(() => parseOwnerDashboardFilters(value, now));
});

test("unknown query keys, duplicate values and game-mode filters are rejected", () => {
  assert.throws(() => parseOwnerDashboardFilters({ sort: "count desc" }, now), /filter_not_allowed/);
  assert.throws(() => parseOwnerDashboardFilters({ source: ["direct", "challenge"] }, now), /filter_duplicate/);
  assert.throws(() => parseOwnerDashboardFilters({ mode: "solo" }, now), /filter_not_allowed/);
});

test("source, surface and edition remain separate and cannot become game mode", () => {
  const summary = ownerDashboardFilterSummary(parseOwnerDashboardFilters({ edition: "west", source: "challenge" }, now));
  assert.match(summary, /edition: west/); assert.match(summary, /source: challenge/); assert.match(summary, /game mode: unsupported/);
  assert.doesNotMatch(summary, /game mode: (?:west|challenge|entry|quiz|solo)/);
});

test("future contextual mode identifiers are not accepted by Prompt 16 analytics properties", () => {
  for (const mode of ["groom_mode", "couples_mode", "party_mode", "solo"]) assert.throws(() => validateAnalyticsProperties({ mode }), /not_allowed/);
});

test("core event metrics and unique sessions are calculated from aggregate counts", () => {
  const value = report();
  assert.equal(value.metrics.visits.value, 160); assert.equal(value.metrics.uniqueSessions.value, 142);
  assert.equal(value.metrics.quizStarts.value, 120); assert.equal(value.metrics.quizCompletions.value, 80);
  assert.equal(value.metrics.resultViews.value, 78);
});

test("visit, completion and result funnels expose numerators, denominators and rates", () => {
  const value = report();
  assert.deepEqual(value.funnels.visitToStart, { numerator: 120, denominator: 160, rate: .75, state: "available", note: "Consented measured traffic." });
  assert.equal(value.funnels.startToCompletion.rate, 80 / 120);
  assert.equal(value.funnels.completionToResultView.rate, 78 / 80);
});

test("share intentions and browser handoffs remain distinct", () => {
  const value = report();
  assert.equal(value.metrics.shareIntentions.value, 122);
  assert.equal(value.metrics.shareHandoffs.value, 84);
  assert.notEqual(value.funnels.completionToShareIntent.rate, value.funnels.completionToShareHandoff.rate);
  assert.doesNotMatch(value.metrics.shareHandoffs.note, /deliver|publish/i);
});

test("challenge and Story funnels use the documented event pairs", () => {
  const value = report();
  assert.equal(value.funnels.challengeViewToAccept.rate, 30 / 48);
  assert.equal(value.funnels.challengeAcceptToCompletion.rate, 22 / 30);
  assert.equal(value.funnels.storyVideoOpenToRenderComplete.rate, 28 / 36);
  assert.equal(value.funnels.storyVideoRenderToShareHandoff.rate, 14 / 28);
});

test("viral coefficient target fixture calculates exactly 2.5 × 0.45 = 1.125", () => {
  const value = report("at_target");
  assert.equal(value.viral.nominationsPerCompletion, 2.5);
  assert.equal(value.viral.referredStartRate, .45);
  assert.equal(value.viral.value, 1.125);
  assert.deepEqual(value.target, { nominationsPerCompletion: 2.5, referredStartRate: .45, viralCoefficient: 1.125 });
});

test("viral fixtures distinguish below, at and above target", () => {
  assert.ok(report("below_target").viral.value < 1.125);
  assert.equal(report("at_target").viral.value, 1.125);
  assert.ok(report("above_target").viral.value > 1.125);
});

test("zero denominators never produce NaN, Infinity or fabricated zero rates", () => {
  const value = buildOwnerDashboardReport(emptyOwnerDashboardSnapshot(), filters(), now);
  assert.equal(value.funnels.visitToStart.rate, null); assert.equal(value.funnels.visitToStart.state, "zero_denominator");
  assert.doesNotMatch(JSON.stringify(value), /NaN|Infinity/);
});

test("small denominators receive directional-only warnings", () => {
  const value = report("small_sample");
  assert.equal(value.funnels.visitToStart.state, "small_sample");
  assert.match(value.funnels.visitToStart.note, /below 20/i);
});

test("game mode, exact timing and cross-session retention are explicitly unsupported", () => {
  const value = report();
  assert.equal(value.gameMode.state, "unsupported"); assert.match(value.gameMode.note, /Source, surface and edition are not game mode/);
  assert.equal(value.timing.state, "unsupported"); assert.equal(value.retention.state, "unsupported");
  assert.doesNotMatch(JSON.stringify(value), /"gameMode".*solo/i);
});

test("commerce-disabled offer and checkout metrics are unavailable rather than fabricated", () => {
  const value = report("commerce_disabled");
  assert.equal(value.metrics.offerViews.value, null); assert.equal(value.metrics.offerViews.state, "disabled");
  assert.equal(value.funnels.offerViewToCheckoutStart.rate, null); assert.equal(value.funnels.offerViewToCheckoutStart.state, "disabled");
});

test("future commerce funnels preserve checkout and purchase numerator direction", () => {
  const snapshot = { ...emptyOwnerDashboardSnapshot(), counts: [
    { key: "offer_view", count: 100 },
    { key: "checkout_start", count: 40 },
    { key: "purchase_complete", count: 25 },
  ] };
  const value = buildOwnerDashboardReport(snapshot, filters(), now, true);
  assert.deepEqual(value.funnels.offerViewToCheckoutStart, { numerator: 40, denominator: 100, rate: .4, state: "available", note: "Consented measured traffic." });
  assert.equal(value.funnels.checkoutStartToPurchase.rate, 25 / 40);
});

test("exact unsupported channel identifiers are not merged into near-duplicates", () => {
  const value = report("channel_comparison");
  for (const channel of ["instagram_story", "clipboard", "copy_link", "direct"]) {
    const row = value.channels.find((candidate) => candidate.channel === channel);
    assert.equal(row.state, "unsupported"); assert.equal(row.intents, null);
  }
  assert.equal(value.channels.find((row) => row.channel === "instagram").state, "available");
  assert.equal(value.channels.find((row) => row.channel === "copy").state, "available");
});

test("dimension filters do not manufacture missing share-event attribution", () => {
  for (const selected of [
    parseOwnerDashboardFilters({ edition: "west" }, now),
    parseOwnerDashboardFilters({ source: "direct" }, now),
    parseOwnerDashboardFilters({ campaign: "none" }, now),
  ]) {
    const value = report("healthy", selected);
    assert.equal(value.metrics.shareIntentions.value, null);
    assert.equal(value.channels[0].state, "unsupported");
  }
});

test("missing attribution remains unknown and narrow known cohorts are suppressed", () => {
  const value = report("missing_attribution");
  assert.ok(value.attribution.some((row) => row.source === "unknown" && row.campaign === "unknown"));
  const narrow = buildOwnerDashboardReport({ ...ownerDashboardReviewSnapshot("healthy"), attribution: [{ source: "challenge", campaign: "challenge", eventName: "quiz_start", count: 4 }] }, filters(), now);
  assert.equal(narrow.attribution[0].displayable, false);
});

test("aggregate CSV has a fixed schema, selected filters and no game-mode value", () => {
  const csv = ownerDashboardCsv(report());
  assert.match(csv, /^\uFEFF"section","metric","value","numerator","denominator","rate","state","period","filters","note"/);
  assert.match(csv, /2026-08-21\/2026-08-27/); assert.match(csv, /"dimension","gameMode"/);
  assert.match(csv, /unsupported by the current analytics data contract/i);
  assert.doesNotMatch(csv, /gameMode","(?:solo|direct|west|quiz)/i);
});

test("CSV spreadsheet formula prefixes are neutralised and CSV values are escaped", () => {
  const value = report();
  const csv = ownerDashboardCsv({ ...value, filterSummary: "=HYPERLINK(\"bad\")\rtest" });
  assert.match(csv, /"'=HYPERLINK\(""bad""\)\rtest"/);
  assert.doesNotMatch(csv, /,"[=+\-@\t\r]/);
});

test("CSV contains aggregate sections but no row-level analytics fields", () => {
  const csv = ownerDashboardCsv(report());
  assert.match(csv, /"metric"/); assert.match(csv, /"funnel"/); assert.match(csv, /"channel"/);
  assert.doesNotMatch(csv, /analytics_session_hash|properties_json|client_event_uuid|challenge_code|result_id|stripe|order_reference/i);
});
