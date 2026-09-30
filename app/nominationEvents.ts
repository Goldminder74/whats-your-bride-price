import type { RegionKey } from "./gameData.ts";

export const nominationEventNames = [
  "share_intent",
  "share_handoff",
  "referred_visit",
] as const;

export const nominationSurfaces = ["result", "comparison", "challenge_landing"] as const;
export const nominationChannels = ["whatsapp", "native", "copy"] as const;

export type NominationEventName = (typeof nominationEventNames)[number];
export type NominationSurface = (typeof nominationSurfaces)[number];
export type NominationChannel = (typeof nominationChannels)[number];

export type NominationEvent = Readonly<{
  name: NominationEventName;
  surface: NominationSurface;
  channel?: NominationChannel;
  slot?: 1 | 2 | 3;
  edition?: RegionKey;
  elapsedMs?: number;
}>;

export function emitNominationEvent(event: NominationEvent): void {
  if (typeof window === "undefined") return;
  const elapsedMs = typeof event.elapsedMs === "number" && Number.isFinite(event.elapsedMs)
    ? Math.max(0, event.elapsedMs)
    : performance.now();
  const safeEvent: NominationEvent = Object.freeze({
    name: event.name,
    surface: event.surface,
    ...(event.channel ? { channel: event.channel } : {}),
    ...(event.slot ? { slot: event.slot } : {}),
    ...(event.edition ? { edition: event.edition } : {}),
    elapsedMs,
  });
  performance.mark(`wybp:${safeEvent.name}`, {
    detail: {
      surface: safeEvent.surface,
      channel: safeEvent.channel,
      slot: safeEvent.slot,
      edition: safeEvent.edition,
      elapsedMs: Math.round(elapsedMs),
    },
  });
  window.dispatchEvent(new CustomEvent<NominationEvent>("wybp:nomination-event", { detail: safeEvent }));
}
