declare const __WYBP_REVIEW_DIAGNOSTICS__: boolean | undefined;

export const entryDiagnosticsEnabled =
  typeof __WYBP_REVIEW_DIAGNOSTICS__ === "boolean" && __WYBP_REVIEW_DIAGNOSTICS__;

export type EntryDiagnosticsSnapshot = Readonly<{
  reducedMotion: boolean;
  webShare: boolean;
  storage: "available" | "blocked";
  connection: string;
}>;

export function readEntryDiagnostics(): EntryDiagnosticsSnapshot {
  if (typeof window === "undefined") {
    return { reducedMotion: false, webShare: false, storage: "blocked", connection: "server" };
  }
  let storage: EntryDiagnosticsSnapshot["storage"] = "available";
  try { void window.localStorage.length; } catch { storage = "blocked"; }
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return Object.freeze({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    webShare: typeof navigator.share === "function",
    storage,
    connection: connection?.effectiveType || (navigator.onLine ? "online" : "offline"),
  });
}
