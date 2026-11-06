export const FRAME_STYLES = Object.freeze({
  kente: Object.freeze({ name: "Kente edge", cowries: 5 }),
  cowrie: Object.freeze({ name: "Cowrie border", cowries: 8 }),
  indigo: Object.freeze({ name: "Indigo court", cowries: 12 }),
  royal: Object.freeze({ name: "Ceremonial gold", cowries: 15 }),
});

export type FrameKey = keyof typeof FRAME_STYLES;

export function isFrameKey(value: unknown): value is FrameKey {
  return typeof value === "string" && Object.hasOwn(FRAME_STYLES, value);
}

/** Extra border drawn inside the existing card. Omitted styles leave the poster unchanged. */
export function frameStyleMarkup(style: FrameKey, width: number, height: number): string {
  if (style === "kente") {
    return `<rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="#bb3e22" stroke-width="12"/>
  <rect x="30" y="30" width="${width - 60}" height="${height - 60}" fill="none" stroke="#f0a11a" stroke-width="5"/>`;
  }
  if (style === "cowrie") {
    return `<rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="28" fill="none" stroke="#f3e7cc" stroke-width="8"/>
  <rect x="32" y="32" width="${width - 64}" height="${height - 64}" rx="18" fill="none" stroke="#c47812" stroke-width="3"/>`;
  }
  if (style === "indigo") {
    return `<rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="#1c3f66" stroke-width="16"/>
  <rect x="32" y="32" width="${width - 64}" height="${height - 64}" fill="none" stroke="#d7e4f2" stroke-width="2"/>`;
  }
  return `<rect x="10" y="10" width="${width - 20}" height="${height - 20}" fill="none" stroke="#f0a11a" stroke-width="14"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" fill="none" stroke="#bb3e22" stroke-width="4"/>`;
}
