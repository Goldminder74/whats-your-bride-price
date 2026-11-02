const PATTERNS: readonly { reason: string; pattern: RegExp }[] = [
  { reason: "sensitivity_initiation", pattern: /\binitiat(?:e|es|ed|ing|ion|ions|ory)\b|\bmukanda\b|\bsecret societ(?:y|ies)\b|\bsecret rite\b|\bage[- ]grade camp\b/i },
  { reason: "sensitivity_sacred", pattern: /\b(?:sacred rite|secret rite|restricted rite|custodial secret|blood oath|ritual sacrifice)\b/i },
  { reason: "sensitivity_fgm", pattern: /\b(?:fgm|female genital|genital cutting|infibulat)\b/i },
  { reason: "sensitivity_witchcraft", pattern: /\b(?:witchcraft|witch[- ]hunt|sorcer(?:y|er)|accused of being a witch)\b/i },
  { reason: "sensitivity_trauma", pattern: /\b(?:genocide|ethnic cleansing|slave trade|slavery|enslaved people|transatlantic|massacre|atrocity|colonial torture)\b/i },
  { reason: "sensitivity_stereotype", pattern: /\b(?:all (?:africans|tribes|women|men) are|primitive tribe|backward people|they all look)\b/i },
  { reason: "sensitivity_worth", pattern: /\b(?:woman(?:'s| is) worth|worth of a (?:woman|bride|wife)|price of a bride|buy(?:ing)? a (?:wife|bride)|bride(?:'s)? price|her value in (?:cows|cowries|money))\b/i },
];

export function sensitivityReasons(text: string): string[] {
  const reasons: string[] = [];
  for (const rule of PATTERNS) {
    if (rule.pattern.test(text)) reasons.push(rule.reason);
  }
  return reasons;
}

export function noteReasons(note: string | null | undefined): string[] {
  if (!note) return [];
  const reasons: string[] = [];
  if (/initiat/i.test(note)) reasons.push("sensitivity_initiation");
  if (/sacred|secret rite|custodial/i.test(note)) reasons.push("sensitivity_sacred");
  if (/enslave|colonial violence|genocide|massacre/i.test(note)) reasons.push("sensitivity_trauma");
  if (/witch/i.test(note)) reasons.push("sensitivity_witchcraft");
  if (/price on a person|woman's worth|bride price/i.test(note)) reasons.push("sensitivity_worth");
  return reasons;
}
