export const displayNameMaximumGraphemes = 30;
export const publicDisplayNameFallback = "A Most Excellent Player";

export type DisplayNameValidation = Readonly<
  | { valid: true; value: string | null; graphemeCount: number }
  | { valid: false; value: null; graphemeCount: number; message: string }
>;

// eslint-disable-next-line no-control-regex -- these code points are the input being rejected
const unsafeControls = /[\u0000-\u001f\u007f-\u009f]/u;
const unsafeInvisibleFormatting = /[\u061c\u200b\u200c\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u;
const htmlDelimiters = /[<>]/u;

export function countDisplayNameGraphemes(value: string): number {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }
  return Array.from(value).length;
}

export function validateDisplayName(input: string): DisplayNameValidation {
  const normalizedInput = input.normalize("NFC");
  if (unsafeControls.test(normalizedInput) || unsafeInvisibleFormatting.test(normalizedInput) || htmlDelimiters.test(normalizedInput)) {
    return Object.freeze({
      valid: false,
      value: null,
      graphemeCount: countDisplayNameGraphemes(normalizedInput),
      message: "Please remove hidden formatting or angle brackets from this name.",
    });
  }
  const value = normalizedInput.trim().replace(/\p{White_Space}+/gu, " ");
  if (!value) return Object.freeze({ valid: true, value: null, graphemeCount: 0 });
  const graphemeCount = countDisplayNameGraphemes(value);
  if (graphemeCount > displayNameMaximumGraphemes) {
    return Object.freeze({
      valid: false,
      value: null,
      graphemeCount,
      message: `Keep the name to ${displayNameMaximumGraphemes} visible characters or fewer.`,
    });
  }
  return Object.freeze({ valid: true, value, graphemeCount });
}

export function safeDisplayNameOrFallback(input: string): string {
  const result = validateDisplayName(input);
  return result.valid && result.value ? result.value : publicDisplayNameFallback;
}
