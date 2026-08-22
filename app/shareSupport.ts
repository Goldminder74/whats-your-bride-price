export type ClipboardWriter = Pick<Clipboard, "writeText"> | undefined;

export async function copyShareText(
  clipboard: ClipboardWriter,
  text: string,
): Promise<"copied" | "unavailable"> {
  if (!clipboard?.writeText) return "unavailable";
  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return "unavailable";
  }
}

export function hasWebShare(candidate: Pick<Navigator, "share"> | object): boolean {
  return "share" in candidate && typeof (candidate as Pick<Navigator, "share">).share === "function";
}
