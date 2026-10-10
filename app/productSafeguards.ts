export const PRODUCT_SAFEGUARD = "A playful culture score, never a measure of human worth.";

export const SCORING_PRINCIPLES = [
  "The quiz tests knowledge of selected African histories, languages, foodways, proverbs and cultural traditions.",
  "The score and ceremonial result are fictional, playful and created for entertainment and learning.",
  "The result is not a valuation of any person.",
  "The result does not assess suitability for marriage or relationships.",
  "Each question simplifies a diverse subject for a short game and is not a universal rule about a people or place.",
  "Questions and explanations are based on reviewed sources linked in the About panel.",
  "Scores can be compared and shared as culture-game results, without demeaning anyone with a lower score.",
] as const;

export const RESULT_TIER_TITLES = [
  "Roots Rookie",
  "Culture Climber",
  "Motherland Scholar",
  "Bride Price Royalty",
] as const;

export const RESULT_TIER_COPY = [
  "Your adventure has begun. Collect the discoveries, explore another region and make your comeback legendary.",
  "You’ve found your rhythm. Take the discoveries with you and chase your next culture milestone.",
  "Sharp instincts, strong knowledge. One more adventure could earn your regional mastery seal.",
  "Nine or more correct! Regional mastery earned. Your culture celebration starts here.",
] as const;

export const RESULT_TIER_GIFTS = [
  ["Ceremonial cowrie score: 5", "a curiosity crown", "a comeback invitation"],
  ["Ceremonial cowrie score: 15", "a promising culture report", "one trunk of celebration fabric"],
  ["Ceremonial cowrie score: 30", "the aunties’ approving nod", "front-row status at the function"],
  ["Ceremonial cowrie score: 50", "a five-auntie standing ovation", "a knowledge victory dance"],
] as const;

export const SAFE_RESULT_SHARE_SUFFIX = `Can you beat my culture score? ${PRODUCT_SAFEGUARD}`;

/**
 * Shared safe-area guidance for result-media renderers. Prompt 14 can reuse this
 * when dynamic social-preview images are introduced. The current static Open
 * Graph artwork is intentionally not rewritten by the application at runtime.
 */
export const RESULT_MEDIA_SAFEGUARD = {
  text: PRODUCT_SAFEGUARD,
  canvasWidth: 1080,
  baselineY: 1240,
  horizontalSafeInset: 78,
} as const;
