import type { RegionKey } from "./gameData.ts";

export const challengeEventNames = [
  "challenge_view",
  "challenge_accept",
  "challenge_invalid",
] as const;

export type ChallengeEventName = (typeof challengeEventNames)[number];
export type ChallengeEvent = Readonly<{
  name: ChallengeEventName;
  edition?: RegionKey;
  state: "active" | "unavailable" | "temporary_failure" | "completed";
  elapsedMs?: number;
}>;

export function emitChallengeEvent(event: ChallengeEvent): void {
  if (typeof window === "undefined") return;
  const safeEvent: ChallengeEvent = Object.freeze({
    name: event.name,
    edition: event.edition,
    state: event.state,
    elapsedMs: typeof event.elapsedMs === "number" && Number.isFinite(event.elapsedMs)
      ? Math.max(0, event.elapsedMs)
      : performance.now(),
  });
  performance.mark(`wybp:${safeEvent.name}`, {
    detail: {
      edition: safeEvent.edition,
      state: safeEvent.state,
      elapsedMs: Math.round(safeEvent.elapsedMs || 0),
    },
  });
  window.dispatchEvent(new CustomEvent<ChallengeEvent>("wybp:challenge-event", { detail: safeEvent }));
}
