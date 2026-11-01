import type { RegionKey } from "./gameData.ts";
import type { ShareSurface } from "./shareProjection.ts";

export const storyVideoEventNames = [
  "story_video_open",
  "story_video_render_start",
  "story_video_render_complete",
  "story_video_render_failed",
  "story_video_share_intent",
  "story_video_share_handoff",
  "story_video_download",
  "story_static_fallback",
] as const;
export const storyVideoChannels = ["native", "instagram", "tiktok", "facebook_story", "whatsapp", "download", "static"] as const;
export const storyVideoStates = ["preview", "rendering", "ready", "cancelled", "unsupported", "failed", "fallback"] as const;

export type StoryVideoEventName = (typeof storyVideoEventNames)[number];
export type StoryVideoChannel = (typeof storyVideoChannels)[number];
export type StoryVideoState = (typeof storyVideoStates)[number];
export type StoryVideoEvent = Readonly<{
  name: StoryVideoEventName;
  edition: RegionKey;
  surface: ShareSurface;
  state: StoryVideoState;
  channel?: StoryVideoChannel;
  elapsedMs?: number;
  byteSize?: number;
}>;

export function safeStoryVideoEvent(value: StoryVideoEvent): StoryVideoEvent | null {
  if (
    !storyVideoEventNames.includes(value.name)
    || !["west", "east", "central", "north", "south"].includes(value.edition)
    || !["result", "comparison", "challenge_landing"].includes(value.surface)
    || !storyVideoStates.includes(value.state)
    || (value.channel !== undefined && !storyVideoChannels.includes(value.channel))
    || (value.elapsedMs !== undefined && (!Number.isFinite(value.elapsedMs) || value.elapsedMs < 0 || value.elapsedMs > 60_000))
    || (value.byteSize !== undefined && (!Number.isInteger(value.byteSize) || value.byteSize < 0 || value.byteSize > 8_000_000))
  ) return null;
  return Object.freeze({
    name: value.name,
    edition: value.edition,
    surface: value.surface,
    state: value.state,
    ...(value.channel ? { channel: value.channel } : {}),
    ...(value.elapsedMs === undefined ? {} : { elapsedMs: Math.round(value.elapsedMs) }),
    ...(value.byteSize === undefined ? {} : { byteSize: value.byteSize }),
  });
}

export function emitStoryVideoEvent(value: StoryVideoEvent): void {
  if (typeof window === "undefined") return;
  const event = safeStoryVideoEvent(value);
  if (!event) return;
  performance.mark(`wybp:${event.name}`, { detail: event });
  window.dispatchEvent(new CustomEvent<StoryVideoEvent>("wybp:story-video-event", { detail: event }));
}
