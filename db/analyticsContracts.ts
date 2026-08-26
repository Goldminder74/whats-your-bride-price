export const ANALYTICS_EVENT_SCHEMA_VERSION = 1 as const;

export const ACTIVE_ANALYTICS_EVENT_NAMES = Object.freeze([
  "app_visit",
  "edition_select",
  "quiz_start",
  "first_question_start",
  "quiz_complete",
  "result_view",
  "result_publish",
  "result_unpublish",
  "challenge_create",
  "challenge_view",
  "challenge_accept",
  "challenge_complete",
  "comparison_view",
  "comparison_outcome",
  "nomination_open",
  "nomination_share_intent",
  "nomination_share_handoff",
  "referred_visit",
  "referred_quiz_start",
  "share_centre_open",
  "share_intent",
  "share_handoff",
  "story_video_open",
  "story_video_render_start",
  "story_video_render_complete",
  "story_video_render_failed",
  "story_video_share_intent",
  "story_video_share_handoff",
  "story_video_download",
  "story_static_fallback",
  "consent_accept",
  "consent_reject",
  "consent_withdraw",
] as const);

export const RESERVED_COMMERCE_EVENT_NAMES = Object.freeze([
  "offer_view",
  "checkout_start",
  "checkout_complete",
  "purchase_complete",
  "payment_failed",
  "refund_complete",
] as const);

export const LEGACY_ANALYTICS_EVENT_NAMES = Object.freeze([
  "entry_viewed",
  "region_selected",
  "avatar_selected",
  "quiz_started",
  "question_answered",
  "quiz_completed",
  "result_viewed",
  "share_interface_selected",
  "share_handoff_attempted",
  "link_copied",
  "referred_visit_received",
  "challenge_accepted",
] as const);

export const LEGACY_REFERRAL_EVENT_NAMES = Object.freeze([
  "link_created",
  "referred_visit_received",
  "challenge_accepted",
  "quiz_started",
  "quiz_completed",
] as const);

export const LEGACY_SHARE_EVENT_NAMES = Object.freeze([
  "share_interface_selected",
  "share_handoff_attempted",
  "link_copied",
] as const);

export const REFERRAL_EVENT_NAMES = Object.freeze(["referred_visit", "referred_quiz_start"] as const);
export const SHARE_EVENT_NAMES = Object.freeze([
  "share_intent",
  "share_handoff",
  "nomination_share_intent",
  "nomination_share_handoff",
  "story_video_share_intent",
  "story_video_share_handoff",
  "story_video_download",
  "story_static_fallback",
] as const);

export const ANALYTICS_CHANNELS = Object.freeze([
  "whatsapp",
  "facebook",
  "facebook_story",
  "instagram",
  "tiktok",
  "native",
  "copy",
  "download",
  "static",
] as const);

export type ActiveAnalyticsEventName = (typeof ACTIVE_ANALYTICS_EVENT_NAMES)[number];
export type ReservedCommerceEventName = (typeof RESERVED_COMMERCE_EVENT_NAMES)[number];
export type AnalyticsEventName = ActiveAnalyticsEventName | ReservedCommerceEventName;
export type AnalyticsEventDestination = "analytics_events" | "referral_events" | "share_events";
export type AnalyticsChannel = (typeof ANALYTICS_CHANNELS)[number];

const activeNames = new Set<string>(ACTIVE_ANALYTICS_EVENT_NAMES);
const reservedNames = new Set<string>(RESERVED_COMMERCE_EVENT_NAMES);
const referralNames = new Set<string>(REFERRAL_EVENT_NAMES);
const shareNames = new Set<string>(SHARE_EVENT_NAMES);

export const ANALYTICS_EVENT_ROUTING: Readonly<Record<ActiveAnalyticsEventName, AnalyticsEventDestination>> = Object.freeze(
  Object.fromEntries(ACTIVE_ANALYTICS_EVENT_NAMES.map((name) => [
    name,
    referralNames.has(name) ? "referral_events" : shareNames.has(name) ? "share_events" : "analytics_events",
  ])) as Record<ActiveAnalyticsEventName, AnalyticsEventDestination>,
);

export class AnalyticsValidationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "AnalyticsValidationError";
    this.code = code;
  }
}

export function validateIngestibleEventName(value: unknown): ActiveAnalyticsEventName {
  if (typeof value !== "string") throw new AnalyticsValidationError("event_name_invalid");
  if (reservedNames.has(value)) throw new AnalyticsValidationError("commerce_event_reserved_not_active");
  if (!activeNames.has(value)) throw new AnalyticsValidationError("event_name_not_active");
  if (value === "consent_reject") throw new AnalyticsValidationError("consent_reject_is_local_only");
  return value as ActiveAnalyticsEventName;
}

export function eventDestination(name: ActiveAnalyticsEventName): AnalyticsEventDestination {
  return ANALYTICS_EVENT_ROUTING[name];
}
