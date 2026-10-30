import type { AnalyticsEventName } from "../db/analyticsContracts.ts";
import type { AnalyticsProperties } from "../db/analytics.ts";

export type LocalAnalyticsEvent = Readonly<{
  name: AnalyticsEventName;
  properties?: AnalyticsProperties;
  referralChallengeCode?: string;
  dedupeKey?: string;
}>;

export function emitAnalyticsLocalEvent(event: LocalAnalyticsEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<LocalAnalyticsEvent>("wybp:analytics-local-event", { detail: Object.freeze(event) }));
}
