export function answersMatch(
  choice: readonly number[],
  expected: readonly number[],
): boolean {
  return (
    choice.length === expected.length &&
    [...choice].sort().every((value, index) => value === [...expected].sort()[index])
  );
}

export function calculateResultTier(correctCount: number): number {
  return Math.min(3, Math.floor(correctCount / 3));
}
