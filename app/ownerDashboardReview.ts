import type { OwnerDashboardAggregateSnapshot } from "../db/ownerDashboard.ts";

export const OWNER_DASHBOARD_REVIEW_SCENARIOS = Object.freeze([
  "empty", "small_sample", "healthy", "drop_off", "below_target", "at_target", "above_target",
  "multi_edition", "channel_comparison", "missing_attribution", "commerce_disabled", "csv_export", "d1_unavailable",
] as const);
export type OwnerDashboardReviewScenario = (typeof OWNER_DASHBOARD_REVIEW_SCENARIOS)[number];

type Counts = Readonly<Record<string, number>>;

const baseCounts: Counts = Object.freeze({
  app_visit: 160, quiz_start: 120, first_question_start: 116, quiz_complete: 80, result_view: 78,
  result_publish: 12, result_unpublish: 2, share_centre_open: 66, share_intent: 42, share_handoff: 30,
  challenge_create: 26, challenge_view: 48, challenge_accept: 30, challenge_complete: 22, comparison_view: 24,
  comparison_outcome: 22, nomination_open: 68, nomination_share_intent: 60, nomination_share_handoff: 40,
  referred_visit: 50, referred_quiz_start: 25, story_video_open: 36, story_video_render_start: 32,
  story_video_render_complete: 28, story_video_render_failed: 4, story_video_share_intent: 20,
  story_video_share_handoff: 14, story_video_download: 12, story_static_fallback: 5,
});

function countsFor(scenario: OwnerDashboardReviewScenario): Counts {
  if (scenario === "empty" || scenario === "d1_unavailable") return Object.freeze({});
  if (scenario === "small_sample") return Object.freeze({ app_visit: 12, quiz_start: 8, first_question_start: 7, quiz_complete: 4, result_view: 4, share_intent: 2, share_handoff: 1, nomination_share_handoff: 1, referred_visit: 4, referred_quiz_start: 1 });
  if (scenario === "drop_off") return Object.freeze({ ...baseCounts, app_visit: 300, quiz_start: 90, quiz_complete: 18, result_view: 16, nomination_share_handoff: 8, referred_visit: 60, referred_quiz_start: 12 });
  if (scenario === "below_target") return Object.freeze({ ...baseCounts, quiz_complete: 100, nomination_share_handoff: 80, referred_visit: 100, referred_quiz_start: 30 });
  if (scenario === "at_target") return Object.freeze({ ...baseCounts, quiz_complete: 20, nomination_share_handoff: 50, referred_visit: 20, referred_quiz_start: 9 });
  if (scenario === "above_target") return Object.freeze({ ...baseCounts, quiz_complete: 40, nomination_share_handoff: 120, referred_visit: 50, referred_quiz_start: 25 });
  return baseCounts;
}

const channelMix = Object.freeze([
  ["share_intent", "whatsapp", 24], ["share_handoff", "whatsapp", 18],
  ["nomination_share_intent", "copy", 18], ["nomination_share_handoff", "copy", 14],
  ["story_video_share_intent", "instagram", 12], ["story_video_share_handoff", "instagram", 7],
  ["story_video_download", "download", 12], ["story_static_fallback", "static", 5],
] as const);

export function ownerDashboardReviewSnapshot(scenario: OwnerDashboardReviewScenario): OwnerDashboardAggregateSnapshot {
  const counts = countsFor(scenario);
  const multi = scenario === "multi_edition";
  const missing = scenario === "missing_attribution";
  return Object.freeze({
    counts: Object.freeze(Object.entries(counts).map(([key, count]) => Object.freeze({ key, count }))),
    uniqueSessions: scenario === "empty" || scenario === "d1_unavailable" ? 0 : scenario === "small_sample" ? 11 : 142,
    channels: Object.freeze(channelMix.map(([eventName, channel, count]) => Object.freeze({ eventName, channel, count }))),
    editions: Object.freeze((multi ? [
      ["west", "app_visit", 48], ["west", "quiz_start", 38], ["west", "quiz_complete", 27],
      ["east", "app_visit", 42], ["east", "quiz_start", 33], ["east", "quiz_complete", 24],
      ["central", "app_visit", 30], ["central", "quiz_start", 20], ["central", "quiz_complete", 12],
      ["north", "app_visit", 22], ["north", "quiz_start", 16], ["north", "quiz_complete", 10],
      ["south", "app_visit", 18], ["south", "quiz_start", 13], ["south", "quiz_complete", 7],
    ] : [["west", "app_visit", counts.app_visit || 0], ["west", "quiz_start", counts.quiz_start || 0], ["west", "quiz_complete", counts.quiz_complete || 0]]).map(([edition, eventName, count]) => Object.freeze({ edition: String(edition), eventName: String(eventName), count: Number(count) }))),
    attribution: Object.freeze((missing ? [
      ["unknown", "unknown", "app_visit", 44], ["unknown", "unknown", "quiz_start", 26], ["unknown", "unknown", "quiz_complete", 15],
      ["direct", "none", "app_visit", 116], ["direct", "none", "quiz_start", 94], ["direct", "none", "quiz_complete", 65],
    ] : [
      ["direct", "none", "app_visit", counts.app_visit || 0], ["direct", "none", "quiz_start", 70], ["direct", "none", "quiz_complete", 50],
      ["challenge", "challenge", "quiz_start", 30], ["challenge", "challenge", "quiz_complete", 20],
      ["nomination", "nomination", "quiz_start", 20], ["nomination", "nomination", "quiz_complete", 10],
    ]).map(([source, campaign, eventName, count]) => Object.freeze({ source: String(source), campaign: String(campaign), eventName: String(eventName), count: Number(count) }))),
    outcomes: Object.freeze([Object.freeze({ outcome: "beat", count: 12 }), Object.freeze({ outcome: "tied", count: 3 }), Object.freeze({ outcome: "did_not_beat", count: 7 })]),
    durations: Object.freeze([Object.freeze({ bucket: "30_to_120s", count: 54 }), Object.freeze({ bucket: "over_120s", count: 26 })]),
  });
}

export function parseOwnerDashboardReviewScenario(value: unknown): OwnerDashboardReviewScenario {
  return typeof value === "string" && OWNER_DASHBOARD_REVIEW_SCENARIOS.includes(value as OwnerDashboardReviewScenario)
    ? value as OwnerDashboardReviewScenario
    : "healthy";
}
