import type { RegionKey } from "./gameData.ts";

export const challengeEventNames = [
  "challenge_view",
  "challenge_accept",
  "challenge_invalid",
  "challenge_complete",
  "comparison_view",
  "comparison_outcome",
  "rechallenge_start",
] as const;

export type ChallengeEventName = (typeof challengeEventNames)[number];
export type ChallengeEvent = Readonly<{
  name: ChallengeEventName;
  edition?: RegionKey;
  state: "active" | "unavailable" | "temporary_failure" | "completed";
  outcome?: "beat" | "tied" | "did_not_beat" | "unavailable";
  elapsedMs?: number;
}>;

export function emitChallengeEvent(event: ChallengeEvent): void {
  if (typeof window === "undefined") return;
  const safeEvent: ChallengeEvent = Object.freeze({
    name: event.name,
    edition: event.edition,
    state: event.state,
    outcome: event.outcome,
    elapsedMs: typeof event.elapsedMs === "number" && Number.isFinite(event.elapsedMs)
      ? Math.max(0, event.elapsedMs)
      : performance.now(),
  });
  performance.mark(`wybp:${safeEvent.name}`, {
    detail: {
      edition: safeEvent.edition,
      state: safeEvent.state,
      outcome: safeEvent.outcome,
      elapsedMs: Math.round(safeEvent.elapsedMs || 0),
    },
  });
  window.dispatchEvent(new CustomEvent<ChallengeEvent>("wybp:challenge-event", { detail: safeEvent }));
}
