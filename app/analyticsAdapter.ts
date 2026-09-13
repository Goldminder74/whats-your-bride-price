import type { AnalyticsProperties } from "../db/analytics.ts";
import type { LocalAnalyticsEvent } from "./analyticsLocal.ts";

type Emit = (event: LocalAnalyticsEvent) => void;

function durationBucket(milliseconds: number | undefined): AnalyticsProperties["durationBucket"] | undefined {
  if (milliseconds === undefined) return undefined;
  if (milliseconds < 1_000) return "under_1s";
  if (milliseconds < 5_000) return "1_to_5s";
  if (milliseconds < 30_000) return "5_to_30s";
  if (milliseconds < 120_000) return "30_to_120s";
  return "over_120s";
}

function fileSizeBucket(bytes: number | undefined): AnalyticsProperties["fileSizeBucket"] | undefined {
  if (bytes === undefined) return undefined;
  if (bytes < 1_000_000) return "under_1mb";
  if (bytes < 4_000_000) return "1_to_4mb";
  return "4_to_8mb";
}

export function installAnalyticsAdapters(emit: Emit): () => void {
  const local = (event: Event) => emit((event as CustomEvent<LocalAnalyticsEvent>).detail);
  const entry = (event: Event) => {
    const detail = (event as CustomEvent).detail as Record<string, unknown>;
    const properties = { ...(detail.edition ? { edition: detail.edition } : {}), source: detail.hasChallenge ? "challenge" : detail.nominated ? "nomination" : "direct" } as AnalyticsProperties;
    if (detail.name === "edition_selected") emit({ name: "edition_select", properties });
  };
  const challenge = (event: Event) => {
    const detail = (event as CustomEvent).detail as Record<string, unknown>;
    if (!["challenge_view", "challenge_accept", "challenge_complete", "comparison_view", "comparison_outcome"].includes(detail.name as string)) return;
    emit({ name: detail.name as LocalAnalyticsEvent["name"], properties: {
      ...(detail.edition ? { edition: detail.edition } : {}),
      surface: String(detail.name).startsWith("comparison") ? "comparison" : "challenge_landing",
      ...(detail.outcome ? { outcome: detail.outcome === "not_beat" ? "did_not_beat" : detail.outcome } : {}),
    } as AnalyticsProperties });
  };
  const nomination = (event: Event) => {
    const detail = (event as CustomEvent).detail as Record<string, unknown>;
    if (detail.name === "share_intent" || detail.name === "share_handoff") emit({
      name: detail.name === "share_intent" ? "nomination_share_intent" : "nomination_share_handoff",
      properties: { ...(detail.edition ? { edition: detail.edition } : {}), surface: detail.surface, channel: detail.channel === "copy" ? "copy" : detail.channel, nominationSlot: detail.slot } as AnalyticsProperties,
    });
  };
  const share = (event: Event) => {
    const detail = (event as CustomEvent).detail as Record<string, unknown>;
    const channel = detail.channel === "copy" ? "copy" : detail.channel;
    if (detail.name === "share_action_selected") emit({ name: "share_intent", properties: { edition: detail.edition, surface: detail.surface, channel } as AnalyticsProperties });
    if (["share_external_handoff", "share_copy_succeeded"].includes(detail.name as string)) emit({ name: "share_handoff", properties: { edition: detail.edition, surface: detail.surface, channel } as AnalyticsProperties });
  };
  const story = (event: Event) => {
    const detail = (event as CustomEvent).detail as Record<string, unknown>;
    emit({ name: detail.name as LocalAnalyticsEvent["name"], properties: {
      edition: detail.edition, surface: "story_video", channel: detail.channel,
      featureState: detail.state, durationBucket: durationBucket(detail.elapsedMs as number | undefined), fileSizeBucket: fileSizeBucket(detail.byteSize as number | undefined),
    } as AnalyticsProperties });
  };
  const listeners: Array<readonly [string, EventListener]> = [
    ["wybp:analytics-local-event", local], ["wybp:entry-event", entry], ["wybp:challenge-event", challenge],
    ["wybp:nomination-event", nomination], ["wybp:share-centre-event", share], ["wybp:story-video-event", story],
  ];
  listeners.forEach(([name, listener]) => window.addEventListener(name, listener));
  return () => listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
}
