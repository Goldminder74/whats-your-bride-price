/** Every on-screen free-game count is derived from this allowance. */
export function freeGamesLeftLabel(left: number, allowance: number): string {
  const games = allowance === 1 ? "game" : "games";
  return `${left} of ${allowance} free ${games} left`;
}

export function freeGamesDoneLabel(allowance: number): string {
  if (allowance === 1) return "Your free game is done";
  return `Your ${allowance} free games are done`;
}

export function freeGamesAllowanceSentence(allowance: number): string {
  if (allowance === 1) return "Your first completed game is free.";
  return `Your first ${allowance} completed games are free.`;
}
