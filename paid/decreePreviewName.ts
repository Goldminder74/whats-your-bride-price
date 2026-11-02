import { assertSafePublicName } from "./nickname.ts";

/** Card frame scaled to a third of the 1080px deliverable. */
export const DECREE_PREVIEW_WIDTH = 360;
export const DECREE_PREVIEW_HEIGHT = 450;
export const DECREE_PREVIEW_NAME = "Your Name";

function graphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map((part) => part.segment);
  }
  return [...value];
}

/** Blank, unsafe, or unfinished names stay on the sample line. A typed name shows as it is. */
export function previewDisplayName(value: unknown): string {
  if (typeof value !== "string") return DECREE_PREVIEW_NAME;
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!name || !/^\p{L}[\p{L}\p{M} '’-]*$/u.test(name)) return DECREE_PREVIEW_NAME;
  const parts = graphemes(name);
  const limited = parts.length > 32 ? parts.slice(0, 32).join("") : name;
  try {
    assertSafePublicName(limited, "name_invalid", "name_rejected");
  } catch {
    return DECREE_PREVIEW_NAME;
  }
  return limited;
}

export function decreePreviewUrl(edition: string, score: number, name: string): string {
  const params = new URLSearchParams({
    edition,
    score: String(score),
    name: previewDisplayName(name),
  });
  return `/api/paid/decree-preview.png?${params.toString()}`;
}
