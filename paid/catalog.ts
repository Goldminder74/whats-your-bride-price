/**
 * Base prices are GBP minor units, matching the published one-off prices.
 * Stripe Adaptive Pricing presents local currency. Stripe Tax adds VAT where
 * it is enabled in the Stripe dashboard. Do not treat these figures as tax-inclusive.
 */
export const products = Object.freeze({
  cowrie_5_v1: Object.freeze({ name: "5 Cowries", amountMinor: 199, quantity: 5, kind: "cowries" as const, displayPrice: "£1.99" }),
  cowrie_15_v1: Object.freeze({ name: "15 Cowries", amountMinor: 499, quantity: 15, kind: "cowries" as const, displayPrice: "£4.99" }),
  cowrie_40_v1: Object.freeze({ name: "40 Cowries", amountMinor: 999, quantity: 40, kind: "cowries" as const, displayPrice: "£9.99" }),
  royal_reveal_v1: Object.freeze({ name: "Royal Reveal", amountMinor: 199, quantity: 1, kind: "royal_reveal" as const, displayPrice: "£1.99" }),
});

export type ProductKey = keyof typeof products;
export const productKeys = Object.freeze(Object.keys(products) as ProductKey[]);

export function isProductKey(value: unknown): value is ProductKey {
  return typeof value === "string" && Object.hasOwn(products, value);
}

/** Markets called out for launch. Checkout still accepts any ISO country so a buyer is not blocked. */
export const priorityCountries = Object.freeze([
  ["NG", "Nigeria", "NGN"],
  ["GH", "Ghana", "GHS"],
  ["KE", "Kenya", "KES"],
  ["ET", "Ethiopia", "ETB"],
  ["RW", "Rwanda", "RWF"],
  ["GB", "United Kingdom", "GBP"],
  ["US", "United States", "USD"],
  ["CA", "Canada", "CAD"],
  ["IE", "Ireland", "EUR"],
  ["FR", "France", "EUR"],
  ["DE", "Germany", "EUR"],
  ["ES", "Spain", "EUR"],
  ["IT", "Italy", "EUR"],
  ["NL", "Netherlands", "EUR"],
  ["BE", "Belgium", "EUR"],
  ["PT", "Portugal", "EUR"],
  ["AT", "Austria", "EUR"],
  ["FI", "Finland", "EUR"],
  ["GR", "Greece", "EUR"],
  ["SE", "Sweden", "EUR"],
  ["DK", "Denmark", "EUR"],
  ["PL", "Poland", "EUR"],
  ["ZA", "South Africa", "ZAR"],
] as const);

/** EU and EEA countries where the 14-day withdrawal right applies to distance contracts. */
export const withdrawalCountries = Object.freeze(new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB",
]));

export const WAIVER_VERSION = "instant-digital-withdrawal-waiver-draft-2026-11-01";

/** Placeholder. Ayo must approve this sentence before live payments. */
export const WAIVER_TEXT = "PLACEHOLDER for owner approval: I am 18 or over. I ask for immediate supply of this digital content and I acknowledge that I lose my 14-day right to withdraw once supply starts. This does not limit my rights if the content is faulty or not as described.";

export const CANONICAL_ORIGIN = "https://brideprice.classesforculture.com";

export function requiresWithdrawalWaiver(country: string): boolean {
  return withdrawalCountries.has(country);
}

export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}
