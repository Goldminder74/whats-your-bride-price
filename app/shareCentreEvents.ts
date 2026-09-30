import type { RegionKey } from "./gameData.ts";
import type { ShareSurface } from "./shareProjection.ts";

export const shareCentreEventNames = [
  "share_action_selected",
  "share_media_prepared",
  "share_sheet_invoked",
  "share_external_handoff",
  "share_copy_succeeded",
  "share_download_started",
  "share_cancelled",
  "share_failed",
] as const;
export const shareCentreChannels = ["whatsapp", "facebook", "instagram", "tiktok", "copy", "native", "download"] as const;
export type ShareCentreEventName = (typeof shareCentreEventNames)[number];
export type ShareCentreChannel = (typeof shareCentreChannels)[number];

export type ShareCentreEvent = Readonly<{
  name: ShareCentreEventName;
  surface: ShareSurface;
  channel?: ShareCentreChannel;
  edition: RegionKey;
  elapsedMs?: number;
}>;

export function safeShareCentreEvent(event: ShareCentreEvent): ShareCentreEvent | null {
  if (
    !shareCentreEventNames.includes(event.name)
    || (event.channel !== undefined && !shareCentreChannels.includes(event.channel))
    || !["result", "comparison", "challenge_landing"].includes(event.surface)
    || !["west", "east", "central", "north", "south"].includes(event.edition)
  ) return null;
  const elapsedMs = typeof event.elapsedMs === "number" && Number.isFinite(event.elapsedMs)
    ? Math.max(0, event.elapsedMs)
    : (typeof performance === "undefined" ? 0 : performance.now());
  return Object.freeze({
    name: event.name,
    surface: event.surface,
    ...(event.channel ? { channel: event.channel } : {}),
    edition: event.edition,
    elapsedMs,
  });
}

export function emitShareCentreEvent(event: ShareCentreEvent): void {
  if (typeof window === "undefined") return;
  const safeEvent = safeShareCentreEvent(event);
  if (!safeEvent) return;
  const elapsedMs = safeEvent.elapsedMs || 0;
  performance.mark(`wybp:${event.name}`, {
    detail: {
      surface: event.surface,
      channel: event.channel,
      edition: event.edition,
      elapsedMs: Math.round(elapsedMs),
    },
  });
  window.dispatchEvent(new CustomEvent<ShareCentreEvent>("wybp:share-centre-event", { detail: safeEvent }));
}
