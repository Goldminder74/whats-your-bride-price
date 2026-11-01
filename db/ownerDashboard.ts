import type { AtomicD1Database } from "./repositories.ts";
import { ANALYTICS_NOTICE_VERSION } from "./analytics.ts";

export const OWNER_DASHBOARD_REPORTING_TIMEZONE = "UTC" as const;
export const OWNER_DASHBOARD_MAX_DAYS = 30;
export const OWNER_DASHBOARD_DEFAULT_DAYS = 7;
export const OWNER_DASHBOARD_SMALL_SAMPLE = 20;
export const OWNER_DASHBOARD_MAX_AGGREGATE_ROWS = 1_200;

export const OWNER_DASHBOARD_EDITIONS = Object.freeze(["west", "east", "central", "north", "south"] as const);
export const OWNER_DASHBOARD_SOURCES = Object.freeze(["direct", "challenge", "nomination", "result", "unknown"] as const);
export const OWNER_DASHBOARD_CAMPAIGNS = Object.freeze(["none", "challenge", "nomination", "unknown"] as const);

export type OwnerDashboardEdition = (typeof OWNER_DASHBOARD_EDITIONS)[number];
export type OwnerDashboardSource = (typeof OWNER_DASHBOARD_SOURCES)[number];
export type OwnerDashboardCampaign = (typeof OWNER_DASHBOARD_CAMPAIGNS)[number];

export class OwnerDashboardValidationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "OwnerDashboardValidationError";
    this.code = code;
  }
}

export type OwnerDashboardFilters = Readonly<{
  fromDate: string;
  toDate: string;
  from: number;
  toExclusive: number;
  edition: OwnerDashboardEdition | null;
  source: OwnerDashboardSource | null;
  campaign: OwnerDashboardCampaign | null;
  timezone: typeof OWNER_DASHBOARD_REPORTING_TIMEZONE;
}>;

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = 86_400_000;

function fail(code: string): never {
  throw new OwnerDashboardValidationError(code);
}

function utcDay(value: string): number {
  if (!dayPattern.test(value)) return fail("date_invalid");
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return fail("date_invalid");
  return timestamp;
}

function dayString(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function one<T extends string>(value: unknown, allowed: readonly T[], code: string): T | null {
  if (value === undefined || value === "" || value === "all") return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) return fail(code);
  return value as T;
}

export function parseOwnerDashboardFilters(
  values: Readonly<Record<string, string | string[] | undefined>>,
  now = Date.now(),
): OwnerDashboardFilters {
  const allowedKeys = new Set(["from", "to", "edition", "source", "campaign"]);
  if (Object.keys(values).some((key) => !allowedKeys.has(key))) return fail("filter_not_allowed");
  if (Object.values(values).some(Array.isArray)) return fail("filter_duplicate");
  const today = Math.floor(now / dayMs) * dayMs;
  const defaultFrom = today - (OWNER_DASHBOARD_DEFAULT_DAYS - 1) * dayMs;
  const fromDate = typeof values.from === "string" && values.from ? values.from : dayString(defaultFrom);
  const toDate = typeof values.to === "string" && values.to ? values.to : dayString(today);
  const from = utcDay(fromDate);
  const to = utcDay(toDate);
  if (to < from) return fail("date_order_invalid");
  if (to > today) return fail("date_future_invalid");
  if ((to - from) / dayMs + 1 > OWNER_DASHBOARD_MAX_DAYS) return fail("date_range_excessive");
  return Object.freeze({
    fromDate,
    toDate,
    from,
    toExclusive: to + dayMs,
    edition: one(values.edition, OWNER_DASHBOARD_EDITIONS, "edition_invalid"),
    source: one(values.source, OWNER_DASHBOARD_SOURCES, "source_invalid"),
    campaign: one(values.campaign, OWNER_DASHBOARD_CAMPAIGNS, "campaign_invalid"),
    timezone: OWNER_DASHBOARD_REPORTING_TIMEZONE,
  });
}

export function ownerDashboardFilterSummary(filters: OwnerDashboardFilters): string {
  return [
    `${filters.fromDate} through ${filters.toDate} inclusive (${filters.timezone})`,
    `edition: ${filters.edition || "all"}`,
    "game mode: unsupported",
    `source: ${filters.source || "all"}`,
    `campaign: ${filters.campaign || "all"}`,
  ].join("; ");
}

export type AggregateCountRow = Readonly<{ key: string; count: number }>;
export type AggregateChannelRow = Readonly<{ eventName: string; channel: string; count: number }>;
export type AggregateEditionRow = Readonly<{ edition: string; eventName: string; count: number }>;
export type AggregateAttributionRow = Readonly<{ source: string; campaign: string; eventName: string; count: number }>;
export type AggregateOutcomeRow = Readonly<{ outcome: string; count: number }>;
export type AggregateDurationRow = Readonly<{ bucket: string; count: number }>;

export type OwnerDashboardAggregateSnapshot = Readonly<{
  counts: readonly AggregateCountRow[];
  uniqueSessions: number;
  channels: readonly AggregateChannelRow[];
  editions: readonly AggregateEditionRow[];
  attribution: readonly AggregateAttributionRow[];
  outcomes: readonly AggregateOutcomeRow[];
  durations: readonly AggregateDurationRow[];
}>;

export interface OwnerDashboardRepository {
  readonly storageAvailable: boolean;
  aggregate(filters: OwnerDashboardFilters, now: number): Promise<OwnerDashboardAggregateSnapshot>;
}

const validEventNamesSql = [
  "app_visit", "edition_select", "quiz_start", "first_question_start", "quiz_complete", "result_view",
  "result_publish", "result_unpublish", "challenge_create", "challenge_view", "challenge_accept", "challenge_complete",
  "comparison_view", "comparison_outcome", "nomination_open", "share_centre_open", "story_video_open",
  "story_video_render_start", "story_video_render_complete", "story_video_render_failed", "consent_accept", "consent_withdraw",
  "offer_view", "checkout_start", "checkout_complete", "purchase_complete", "payment_failed", "refund_complete",
].map((name) => `'${name}'`).join(",");

const normalizedCte = `WITH valid_sessions AS (
  SELECT analytics_session_hash FROM consent_preferences
  WHERE analytics_session_hash IS NOT NULL AND notice_version=?1 AND first_party_statistical=1 AND marketing=0
    AND withdrawn_at IS NULL AND deleted_at IS NULL AND expires_at>?2
  GROUP BY analytics_session_hash
), normalized AS (
  SELECT e.event_name AS event_name,e.analytics_session_hash AS session_hash,e.occurred_at AS occurred_at,
    COALESCE(json_extract(e.properties_json,'$.edition'),'unknown') AS edition,
    COALESCE(json_extract(e.properties_json,'$.source'),'unknown') AS source,
    COALESCE(json_extract(e.properties_json,'$.campaign'),'unknown') AS campaign,
    COALESCE(json_extract(e.properties_json,'$.channel'),'unknown') AS channel,
    COALESCE(json_extract(e.properties_json,'$.outcome'),'unknown') AS outcome,
    COALESCE(json_extract(e.properties_json,'$.durationBucket'),'unknown') AS duration_bucket
  FROM analytics_events e INNER JOIN valid_sessions s ON s.analytics_session_hash=e.analytics_session_hash
  WHERE e.event_schema_version=1 AND e.deleted_at IS NULL AND e.expires_at>?2 AND e.occurred_at>=?3 AND e.occurred_at<?4
    AND e.event_name IN (${validEventNamesSql})
  UNION ALL
  SELECT r.event_type,r.analytics_session_hash,r.occurred_at,'unknown',r.source,'unknown','unknown','unknown','unknown'
  FROM referral_events r INNER JOIN valid_sessions s ON s.analytics_session_hash=r.analytics_session_hash
  WHERE r.event_schema_version=1 AND r.deleted_at IS NULL AND r.expires_at>?2 AND r.occurred_at>=?3 AND r.occurred_at<?4
    AND r.event_type IN ('referred_visit','referred_quiz_start')
  UNION ALL
  SELECT h.event_type,h.analytics_session_hash,h.occurred_at,'unknown','unknown','unknown',h.channel,'unknown','unknown'
  FROM share_events h INNER JOIN valid_sessions s ON s.analytics_session_hash=h.analytics_session_hash
  WHERE h.event_schema_version=1 AND h.deleted_at IS NULL AND h.expires_at>?2 AND h.occurred_at>=?3 AND h.occurred_at<?4
    AND h.event_type IN ('share_intent','share_handoff','nomination_share_intent','nomination_share_handoff','story_video_share_intent','story_video_share_handoff','story_video_download','story_static_fallback')
), filtered AS (
  SELECT * FROM normalized WHERE (?5 IS NULL OR edition=?5) AND (?6 IS NULL OR source=?6) AND (?7 IS NULL OR campaign=?7)
)`;

type D1Rows<T> = Readonly<{ results?: T[] }>;

export class D1OwnerDashboardRepository implements OwnerDashboardRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }

  async aggregate(filters: OwnerDashboardFilters, now: number): Promise<OwnerDashboardAggregateSnapshot> {
    const queries = [
      "SELECT event_name AS key,count(*) AS count FROM filtered GROUP BY event_name ORDER BY event_name",
      "SELECT count(DISTINCT session_hash) AS count FROM filtered",
      "SELECT event_name,channel,count(*) AS count FROM filtered WHERE channel<>'unknown' GROUP BY event_name,channel ORDER BY channel,event_name",
      "SELECT edition,event_name,count(*) AS count FROM filtered GROUP BY edition,event_name ORDER BY edition,event_name",
      "SELECT source,campaign,event_name,count(*) AS count FROM filtered GROUP BY source,campaign,event_name ORDER BY source,campaign,event_name",
      "SELECT outcome,count(*) AS count FROM filtered WHERE outcome<>'unknown' GROUP BY outcome ORDER BY outcome",
      "SELECT duration_bucket AS bucket,count(*) AS count FROM filtered WHERE duration_bucket<>'unknown' GROUP BY duration_bucket ORDER BY duration_bucket",
    ];
    const statements = queries.map((query) => this.database.prepare(`${normalizedCte} ${query}`).bind(
      ANALYTICS_NOTICE_VERSION,
      now,
      filters.from,
      filters.toExclusive,
      filters.edition,
      filters.source,
      filters.campaign,
    ));
    const results = await this.database.batch(statements);
    const rowCount = results.reduce((total, result) => total + (result.results?.length || 0), 0);
    if (rowCount > OWNER_DASHBOARD_MAX_AGGREGATE_ROWS) return fail("aggregate_response_excessive");
    const rows = <T,>(index: number) => ((results[index] as D1Rows<T>).results || []);
    return Object.freeze({
      counts: Object.freeze(rows<{ key: string; count: number }>(0).map((row) => Object.freeze({ key: row.key, count: Number(row.count) }))),
      uniqueSessions: Number(rows<{ count: number }>(1)[0]?.count || 0),
      channels: Object.freeze(rows<{ event_name: string; channel: string; count: number }>(2).map((row) => Object.freeze({ eventName: row.event_name, channel: row.channel, count: Number(row.count) }))),
      editions: Object.freeze(rows<{ edition: string; event_name: string; count: number }>(3).map((row) => Object.freeze({ edition: row.edition, eventName: row.event_name, count: Number(row.count) }))),
      attribution: Object.freeze(rows<{ source: string; campaign: string; event_name: string; count: number }>(4).map((row) => Object.freeze({ source: row.source, campaign: row.campaign, eventName: row.event_name, count: Number(row.count) }))),
      outcomes: Object.freeze(rows<{ outcome: string; count: number }>(5).map((row) => Object.freeze({ outcome: row.outcome, count: Number(row.count) }))),
      durations: Object.freeze(rows<{ bucket: string; count: number }>(6).map((row) => Object.freeze({ bucket: row.bucket, count: Number(row.count) }))),
    });
  }
}

export type DashboardValueState = "available" | "zero_denominator" | "small_sample" | "unsupported" | "disabled";
export type DashboardMetric = Readonly<{ value: number | null; state: DashboardValueState; note: string }>;
export type DashboardRate = Readonly<{
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
  state: DashboardValueState;
  note: string;
}>;

export type OwnerDashboardReport = Readonly<{
  basis: "consented_measured_traffic";
  filters: OwnerDashboardFilters;
  filterSummary: string;
  refreshedAt: number;
  metrics: Readonly<Record<string, DashboardMetric>>;
  funnels: Readonly<Record<string, DashboardRate>>;
  viral: Readonly<{ nominationsPerCompletion: number | null; referredStartRate: number | null; value: number | null; state: DashboardValueState; note: string }>;
  target: Readonly<{ nominationsPerCompletion: 2.5; referredStartRate: 0.45; viralCoefficient: 1.125 }>;
  channels: readonly Readonly<{ channel: string; intents: number | null; handoffs: number | null; downloads: number | null; staticFallbacks: number | null; state: "available" | "unsupported"; note: string }>[];
  editions: readonly Readonly<{ edition: string; visits: number; starts: number; completions: number; completionRate: number | null; smallSample: boolean }>[];
  attribution: readonly Readonly<{ source: string; campaign: string; visits: number; starts: number; completions: number; completionRate: number | null; displayable: boolean }>[];
  outcomes: Readonly<Record<string, number>>;
  durations: readonly AggregateDurationRow[];
  gameMode: Readonly<{ state: "unsupported"; note: string }>;
  timing: Readonly<{ state: "unsupported"; note: string }>;
  retention: Readonly<{ state: "unsupported"; note: string }>;
  commerce: Readonly<{ enabled: boolean; note: string }>;
}>;

const shareNames = new Set(["share_intent", "share_handoff", "nomination_share_intent", "nomination_share_handoff", "story_video_share_intent", "story_video_share_handoff", "story_video_download", "story_static_fallback"]);
const referralNames = new Set(["referred_visit", "referred_quiz_start"]);

function filtersUnsupportedFor(name: string, filters: OwnerDashboardFilters): boolean {
  if (shareNames.has(name)) return Boolean(filters.edition || filters.source || filters.campaign);
  if (referralNames.has(name)) return Boolean(filters.edition || filters.campaign);
  return false;
}

function countMap(snapshot: OwnerDashboardAggregateSnapshot): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(snapshot.counts.map((row) => [row.key, row.count])));
}

function metricValue(name: string, counts: Readonly<Record<string, number>>, filters: OwnerDashboardFilters, disabled = false): DashboardMetric {
  if (disabled) return Object.freeze({ value: null, state: "disabled", note: "Commerce is disabled; no value is fabricated." });
  if (filtersUnsupportedFor(name, filters)) return Object.freeze({ value: null, state: "unsupported", note: "The selected dimension is not stored for this event family." });
  return Object.freeze({ value: counts[name] || 0, state: "available", note: "Consented measured events." });
}

function rate(numerator: DashboardMetric, denominator: DashboardMetric): DashboardRate {
  if (numerator.value === null || denominator.value === null) return Object.freeze({ numerator: numerator.value, denominator: denominator.value, rate: null, state: numerator.state === "disabled" || denominator.state === "disabled" ? "disabled" : "unsupported", note: numerator.value === null ? numerator.note : denominator.note });
  if (denominator.value === 0) return Object.freeze({ numerator: numerator.value, denominator: 0, rate: null, state: "zero_denominator", note: "No denominator events in the selected consented measured traffic." });
  const state = denominator.value < OWNER_DASHBOARD_SMALL_SAMPLE ? "small_sample" : "available";
  return Object.freeze({ numerator: numerator.value, denominator: denominator.value, rate: numerator.value / denominator.value, state, note: state === "small_sample" ? `Directional only: denominator is below ${OWNER_DASHBOARD_SMALL_SAMPLE}.` : "Consented measured traffic." });
}

function combinedMetric(names: readonly string[], counts: Readonly<Record<string, number>>, filters: OwnerDashboardFilters): DashboardMetric {
  const values = names.map((name) => metricValue(name, counts, filters));
  const unavailable = values.find((value) => value.value === null);
  if (unavailable) return unavailable;
  return Object.freeze({ value: values.reduce((sum, value) => sum + (value.value || 0), 0), state: "available", note: "Consented measured events; intent and handoff families remain distinct." });
}

export function buildOwnerDashboardReport(
  snapshot: OwnerDashboardAggregateSnapshot,
  filters: OwnerDashboardFilters,
  now = Date.now(),
  commerceEnabled = false,
): OwnerDashboardReport {
  const counts = countMap(snapshot);
  const event = (name: string, disabled = false) => metricValue(name, counts, filters, disabled);
  const completions = event("quiz_complete");
  const shareIntents = combinedMetric(["share_intent", "nomination_share_intent", "story_video_share_intent"], counts, filters);
  const shareHandoffs = combinedMetric(["share_handoff", "nomination_share_handoff", "story_video_share_handoff"], counts, filters);
  const nominations = event("nomination_share_handoff");
  const referredVisits = event("referred_visit");
  const referredStarts = event("referred_quiz_start");
  const metrics: Record<string, DashboardMetric> = {
    visits: event("app_visit"),
    uniqueSessions: Object.freeze({ value: snapshot.uniqueSessions, state: "available", note: "Distinct anonymous analytics-session hashes; hashes are never returned." }),
    quizStarts: event("quiz_start"), firstQuestionStarts: event("first_question_start"), quizCompletions: completions,
    resultViews: event("result_view"), resultPublications: event("result_publish"), resultUnpublications: event("result_unpublish"),
    shareCentreOpens: event("share_centre_open"), shareIntentions: shareIntents, shareHandoffs,
    challengeCreations: event("challenge_create"), challengeViews: event("challenge_view"), challengeAcceptances: event("challenge_accept"), challengeCompletions: event("challenge_complete"),
    comparisonViews: event("comparison_view"), nominationOpens: event("nomination_open"), nominationShareIntentions: event("nomination_share_intent"), nominationShareHandoffs: nominations,
    referredVisits, referredQuizStarts: referredStarts,
    storyVideoOpens: event("story_video_open"), storyVideoRenderStarts: event("story_video_render_start"), storyVideoRenderCompletions: event("story_video_render_complete"), storyVideoRenderFailures: event("story_video_render_failed"),
    storyVideoShareIntentions: event("story_video_share_intent"), storyVideoShareHandoffs: event("story_video_share_handoff"), storyVideoDownloads: event("story_video_download"), storyStaticFallbacks: event("story_static_fallback"),
    offerViews: event("offer_view", !commerceEnabled),
  };
  const funnels: Record<string, DashboardRate> = {
    visitToStart: rate(metrics.quizStarts, metrics.visits),
    startToCompletion: rate(completions, metrics.quizStarts),
    completionToResultView: rate(metrics.resultViews, completions),
    completionToShareIntent: rate(shareIntents, completions),
    completionToShareHandoff: rate(shareHandoffs, completions),
    nominationHandoffsPerCompletion: rate(nominations, completions),
    referredVisitToStart: rate(referredStarts, referredVisits),
    challengeViewToAccept: rate(metrics.challengeAcceptances, metrics.challengeViews),
    challengeAcceptToCompletion: rate(metrics.challengeCompletions, metrics.challengeAcceptances),
    storyVideoOpenToRenderComplete: rate(metrics.storyVideoRenderCompletions, metrics.storyVideoOpens),
    storyVideoRenderToShareHandoff: rate(metrics.storyVideoShareHandoffs, metrics.storyVideoRenderCompletions),
    offerViewToCheckoutStart: rate(event("checkout_start", !commerceEnabled), metrics.offerViews),
    checkoutStartToPurchase: rate(event("purchase_complete", !commerceEnabled), event("checkout_start", !commerceEnabled)),
  };
  const nominationRate = funnels.nominationHandoffsPerCompletion.rate;
  const referredRate = funnels.referredVisitToStart.rate;
  const viralValue = nominationRate === null || referredRate === null ? null : nominationRate * referredRate;
  const viralState = viralValue === null ? (funnels.nominationHandoffsPerCompletion.state === "disabled" ? "disabled" : "unsupported") : funnels.nominationHandoffsPerCompletion.state === "small_sample" || funnels.referredVisitToStart.state === "small_sample" ? "small_sample" : "available";
  const controlledChannels = ["whatsapp", "facebook", "facebook_story", "instagram", "tiktok", "native", "copy", "download", "static"];
  const unsupportedChannelLabels = ["instagram_story", "clipboard", "copy_link", "direct"];
  const channelFilteringUnsupported = Boolean(filters.edition || filters.source || filters.campaign);
  const channels = [...controlledChannels, ...unsupportedChannelLabels].map((channel) => {
    if (unsupportedChannelLabels.includes(channel)) return Object.freeze({ channel, intents: null, handoffs: null, downloads: null, staticFallbacks: null, state: "unsupported" as const, note: "This exact channel identifier is not present in the version-1 analytics contract; no near-duplicate is substituted." });
    if (channelFilteringUnsupported) return Object.freeze({ channel, intents: null, handoffs: null, downloads: null, staticFallbacks: null, state: "unsupported" as const, note: "Share-event storage does not retain the selected edition, source or campaign dimension." });
    const amount = (names: readonly string[]) => snapshot.channels.filter((row) => row.channel === channel && names.includes(row.eventName)).reduce((sum, row) => sum + row.count, 0);
    return Object.freeze({ channel, intents: amount(["share_intent", "nomination_share_intent", "story_video_share_intent"]), handoffs: amount(["share_handoff", "nomination_share_handoff", "story_video_share_handoff"]), downloads: amount(["story_video_download"]), staticFallbacks: amount(["story_static_fallback"]), state: "available" as const, note: "Handoffs are browser successes, not delivery, receipt or publication." });
  });
  const editions = [...new Set(snapshot.editions.map((row) => row.edition))].sort().map((edition) => {
    const amount = (name: string) => snapshot.editions.filter((row) => row.edition === edition && row.eventName === name).reduce((sum, row) => sum + row.count, 0);
    const starts = amount("quiz_start"); const complete = amount("quiz_complete");
    return Object.freeze({ edition, visits: amount("app_visit"), starts, completions: complete, completionRate: starts ? complete / starts : null, smallSample: starts > 0 && starts < OWNER_DASHBOARD_SMALL_SAMPLE });
  });
  const attributionKeys = [...new Set(snapshot.attribution.map((row) => `${row.source}\u0000${row.campaign}`))].sort();
  const attribution = attributionKeys.map((key) => {
    const [source, campaign] = key.split("\u0000"); const cohort = snapshot.attribution.filter((row) => row.source === source && row.campaign === campaign);
    const amount = (name: string) => cohort.filter((row) => row.eventName === name).reduce((sum, row) => sum + row.count, 0);
    const starts = amount("quiz_start"); const complete = amount("quiz_complete"); const denominator = Math.max(amount("app_visit"), starts);
    return Object.freeze({ source, campaign, visits: amount("app_visit"), starts, completions: complete, completionRate: starts ? complete / starts : null, displayable: denominator >= OWNER_DASHBOARD_SMALL_SAMPLE || source === "unknown" || campaign === "unknown" });
  });
  return Object.freeze({
    basis: "consented_measured_traffic",
    filters,
    filterSummary: ownerDashboardFilterSummary(filters),
    refreshedAt: now,
    metrics: Object.freeze(metrics),
    funnels: Object.freeze(funnels),
    viral: Object.freeze({ nominationsPerCompletion: nominationRate, referredStartRate: referredRate, value: viralValue, state: viralState, note: viralValue === null ? "Unavailable for the selected filter coverage." : viralState === "small_sample" ? `Directional only: one or more denominators are below ${OWNER_DASHBOARD_SMALL_SAMPLE}.` : "Calculated from selected consented measured traffic." }),
    target: Object.freeze({ nominationsPerCompletion: 2.5, referredStartRate: 0.45, viralCoefficient: 1.125 }),
    channels: Object.freeze(channels),
    editions: Object.freeze(editions),
    attribution: Object.freeze(attribution),
    outcomes: Object.freeze(Object.fromEntries(snapshot.outcomes.map((row) => [row.outcome, row.count]))),
    durations: snapshot.durations,
    gameMode: Object.freeze({ state: "unsupported", note: "Unsupported by the current analytics data contract. Source, surface and edition are not game mode." }),
    timing: Object.freeze({ state: "unsupported", note: "Exact journey relationships and durations are not stored; broad duration buckets cannot produce honest medians." }),
    retention: Object.freeze({ state: "unsupported", note: "The 24-hour anonymous analytics session cannot identify daily return or streak behaviour across sessions." }),
    commerce: Object.freeze({ enabled: commerceEnabled, note: commerceEnabled ? "Authoritative commerce analytics may be reported." : "Commerce disabled; offer and checkout funnels are not populated or fabricated." }),
  });
}

function safeCsvCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

export function ownerDashboardCsv(report: OwnerDashboardReport): string {
  const header = ["section", "metric", "value", "numerator", "denominator", "rate", "state", "period", "filters", "note"];
  const rows: string[][] = [header];
  for (const [name, value] of Object.entries(report.metrics)) rows.push(["metric", name, value.value === null ? "" : String(value.value), "", "", "", value.state, `${report.filters.fromDate}/${report.filters.toDate}`, report.filterSummary, value.note]);
  for (const [name, value] of Object.entries(report.funnels)) rows.push(["funnel", name, "", value.numerator === null ? "" : String(value.numerator), value.denominator === null ? "" : String(value.denominator), value.rate === null ? "" : String(value.rate), value.state, `${report.filters.fromDate}/${report.filters.toDate}`, report.filterSummary, value.note]);
  rows.push(["viral", "viralCoefficient", report.viral.value === null ? "" : String(report.viral.value), "", "", "", report.viral.state, `${report.filters.fromDate}/${report.filters.toDate}`, report.filterSummary, report.viral.note]);
  rows.push(["dimension", "gameMode", "", "", "", "", "unsupported", `${report.filters.fromDate}/${report.filters.toDate}`, report.filterSummary, report.gameMode.note]);
  for (const channel of report.channels) rows.push(["channel", channel.channel, "", channel.intents === null ? "" : String(channel.intents), channel.handoffs === null ? "" : String(channel.handoffs), "", channel.state, `${report.filters.fromDate}/${report.filters.toDate}`, report.filterSummary, channel.note]);
  for (const edition of report.editions) rows.push(["edition", edition.edition, String(edition.completions), String(edition.completions), String(edition.starts), edition.completionRate === null ? "" : String(edition.completionRate), edition.smallSample ? "small_sample" : "available", `${report.filters.fromDate}/${report.filters.toDate}`, report.filterSummary, "Edition is a separate stored dimension; share-event edition attribution is unavailable."]);
  for (const cohort of report.attribution) rows.push(["attribution", `${cohort.source}/${cohort.campaign}`, cohort.displayable ? String(cohort.completions) : "", cohort.displayable ? String(cohort.completions) : "", cohort.displayable ? String(cohort.starts) : "", cohort.displayable && cohort.completionRate !== null ? String(cohort.completionRate) : "", cohort.displayable ? "available" : "small_sample_suppressed", `${report.filters.fromDate}/${report.filters.toDate}`, report.filterSummary, cohort.displayable ? "Stored controlled attribution only." : `Cohort hidden below the ${OWNER_DASHBOARD_SMALL_SAMPLE}-event minimum.`]);
  return `\uFEFF${rows.map((row) => row.map((cell) => safeCsvCell(cell)).join(",")).join("\r\n")}\r\n`;
}

export function emptyOwnerDashboardSnapshot(): OwnerDashboardAggregateSnapshot {
  return Object.freeze({ counts: Object.freeze([]), uniqueSessions: 0, channels: Object.freeze([]), editions: Object.freeze([]), attribution: Object.freeze([]), outcomes: Object.freeze([]), durations: Object.freeze([]) });
}
