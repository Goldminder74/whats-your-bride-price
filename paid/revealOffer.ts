/** Whether a finished round can be stored so the Royal Reveal offer can open. */
export function revealAnswersReady(choices: readonly (readonly number[])[] | null | undefined): boolean {
  return Array.isArray(choices)
    && choices.length === 12
    && choices.every((choice) => Array.isArray(choice) && choice.length > 0 && choice.length <= 8);
}

export function buildRevealRecording(input: {
  royalOn: boolean;
  edition: string;
  playerId: string;
  choices: number[][];
  roundId?: string | null;
  questionIds?: readonly string[];
}): { edition: string; playerId: string; answers: number[][]; roundId?: string; questionIds?: string[] } | null {
  if (!input.royalOn || !revealAnswersReady(input.choices)) return null;
  const body: { edition: string; playerId: string; answers: number[][]; roundId?: string; questionIds?: string[] } = {
    edition: input.edition,
    playerId: input.playerId,
    answers: input.choices.map((choice) => [...choice]),
  };
  if (input.roundId) body.roundId = input.roundId;
  const ids = (input.questionIds ?? []).filter((id) => id.length > 0);
  if (ids.length === 12 && new Set(ids).size === 12) body.questionIds = [...ids];
  return body;
}
