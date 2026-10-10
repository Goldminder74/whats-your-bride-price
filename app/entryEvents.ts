import type { ControlledSource } from "./entryContext";
import type { RegionKey } from "./gameData";

export const entryEventNames = [
  "entry_view",
  "entry_shell_visible",
  "entry_interactive",
  "entry_retry",
  "entry_context_invalid",
  "edition_selected",
  "avatar_selected",
  "quiz_started",
  "quiz_resumed",
  "quiz_restarted",
  "photo_picker_opened",
  "photo_skipped",
] as const;

export type EntryEventName = (typeof entryEventNames)[number];
export type EntryEvent = Readonly<{
  name: EntryEventName;
  source: ControlledSource;
  edition?: RegionKey;
  nominated: boolean;
  hasChallenge: boolean;
  hasInvalidContext: boolean;
  elapsedMs?: number;
  shellVisibleMs?: number;
  firstMeaningfulChoiceReadyMs?: number;
  avatarChoiceReadyMs?: number;
  questionOneReadyMs?: number;
}>;

export function emitEntryEvent(event: EntryEvent): void {
  if (typeof window === "undefined") return;
  const elapsedMs = typeof event.elapsedMs === "number" && Number.isFinite(event.elapsedMs)
    ? Math.max(0, event.elapsedMs)
    : performance.now();
  const normalisedEvent: EntryEvent = Object.freeze({
    ...event,
    elapsedMs,
    shellVisibleMs: event.shellVisibleMs ?? (event.name === "entry_shell_visible" ? elapsedMs : undefined),
    firstMeaningfulChoiceReadyMs: event.firstMeaningfulChoiceReadyMs ?? (event.name === "entry_interactive" ? elapsedMs : undefined),
    avatarChoiceReadyMs: event.avatarChoiceReadyMs ?? (event.name === "avatar_selected" ? elapsedMs : undefined),
    questionOneReadyMs: event.questionOneReadyMs ?? (event.name === "quiz_started" ? elapsedMs : undefined),
  });
  performance.mark(`wybp:${event.name}`, { detail: {
      elapsedMs: Math.round(elapsedMs),
      shellVisibleMs: normalisedEvent.shellVisibleMs,
      firstMeaningfulChoiceReadyMs: normalisedEvent.firstMeaningfulChoiceReadyMs,
      avatarChoiceReadyMs: normalisedEvent.avatarChoiceReadyMs,
      questionOneReadyMs: normalisedEvent.questionOneReadyMs,
    } });
  window.dispatchEvent(new CustomEvent<EntryEvent>("wybp:entry-event", { detail: normalisedEvent }));
}
