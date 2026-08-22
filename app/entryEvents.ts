import type { ControlledSource } from "./entryContext";
import type { RegionKey } from "./gameData";

export const entryEventNames = [
  "entry_view",
  "entry_shell_visible",
  "entry_interactive",
  "entry_retry",
  "entry_context_invalid",
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
}>;

export function emitEntryEvent(event: EntryEvent): void {
  if (typeof window === "undefined") return;
  if (typeof event.elapsedMs === "number" && Number.isFinite(event.elapsedMs)) {
    performance.mark(`wybp:${event.name}`, { detail: { elapsedMs: Math.max(0, Math.round(event.elapsedMs)) } });
  } else {
    performance.mark(`wybp:${event.name}`);
  }
  window.dispatchEvent(new CustomEvent<EntryEvent>("wybp:entry-event", { detail: Object.freeze({ ...event }) }));
}
