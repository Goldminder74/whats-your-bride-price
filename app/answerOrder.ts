// Presentation only: canonical option IDs and scoring never change. Every
// source option visits each display position once in each four-question block.
// A fresh, device-generated quiz ID changes both the base order and the block
// schedule; recovery with the same ID keeps choices stable.
export function classicAnswerOrder(quizId: string | null, edition: string, questionIndex: number, count: number): readonly number[] {
  const canonical = Array.from({ length: count }, (_, i) => i);
  if (!quizId || count < 2) return canonical;
  let seed = 2166136261;
  for (const character of `${quizId}:${edition}:${Math.floor(questionIndex / count)}`) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const shuffle = (values: number[]) => {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  };
  const base = shuffle(canonical);
  const shifts = shuffle(Array.from({ length: count }, (_, i) => i));
  const shift = shifts[questionIndex % count];
  return base.map((_, displayIndex) => base[(displayIndex + shift) % count]);
}
