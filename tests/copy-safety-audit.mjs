const HIGH_RISK_PHRASES = [
  ["higher-bride-price", /higher your bride price/i],
  ["deserved-bride-price", /bride price you deserve/i],
  ["groom-must-pay", /groom must pay/i],
  ["prove-high-value", /prove your high value/i],
  ["raised-bride-price", /raised the bride price/i],
  ["financial-readiness", /financially prepared|emergency budget meeting/i],
  ["marriage-shaming", /not marriage material|unsuitable for marriage/i],
  ["human-value-ranking", /low[- ]value (?:woman|person)|high[- ]value (?:woman|person)|worth less/i],
  ["appearance-scoring", /(?:photo|appearance|beauty|skin tone).{0,45}(?:raised|increased|determined|changed).{0,20}(?:score|result)/i],
  ["identity-verification", /verified (?:your )?(?:ethnicity|identity|nationality)/i],
  ["false-share-success", /(?:message|post|nomination).{0,25}(?:was|has been) (?:sent|published|posted)/i],
];

// “Bride Price” is retained only as the reviewed product title, its clearly
// fictional top-tier name, technical download filenames and a culture-game
// share title. New exceptions require an explicit reason and test review.
export const APPROVED_BRIDE_PRICE_CONTEXTS = [
  { path: "app/BridePriceGame.tsx", phrase: "What’s Your Bride Price?", reason: "product title in invitation copy" },
  { path: "app/BridePriceGame.tsx", phrase: "WHAT’S YOUR BRIDE PRICE?", reason: "product title in exported portrait" },
  { path: "app/BridePriceGame.tsx", phrase: "BRIDE PRICE?</strong>", reason: "product wordmark" },
  { path: "app/BridePriceGame.tsx", phrase: "bride-price-${regionKey}-result.png", reason: "download filename" },
  { path: "app/BridePriceGame.tsx", phrase: "my-bride-price-result.png", reason: "shared-file filename" },
  { path: "app/BridePriceGame.tsx", phrase: "My Bride Price culture-game result", reason: "framed share title" },
  { path: "app/layout.tsx", phrase: "What’s Your Bride Price?", reason: "product metadata title" },
  { path: "app/page.tsx", phrase: "What’s Your Bride Price?", reason: "product metadata title" },
  { path: "app/productSafeguards.ts", phrase: "Bride Price Royalty", reason: "fictional top-tier game name" },
];

export function auditCopySources(sources) {
  const violations = [];
  for (const { path, content } of sources) {
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      for (const [id, pattern] of HIGH_RISK_PHRASES) {
        if (pattern.test(line)) violations.push({ path, line: index + 1, id, text: line.trim() });
      }
      if (/bride[ -]price/i.test(line)) {
        const approved = APPROVED_BRIDE_PRICE_CONTEXTS.some((context) => context.path === path && line.includes(context.phrase));
        if (!approved) violations.push({ path, line: index + 1, id: "unreviewed-bride-price-context", text: line.trim() });
      }
    }
  }
  return violations;
}
