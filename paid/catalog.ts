/**
 * Base prices are GBP minor units, matching the published one-off prices.
 * Stripe Adaptive Pricing may present the same price in another currency.
 * Stripe Tax is off unless STRIPE_AUTOMATIC_TAX=on. The price shown is the final price.
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

/** Markets called out for launch. Paid checkout refuses the blocked-country list below. */
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

/** EU27 plus EEA members Iceland, Liechtenstein and Norway. The UK is not in this list. */
export const DEFAULT_PAID_BLOCKED_COUNTRIES = Object.freeze([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
]);

export const PURCHASES_UNAVAILABLE_MESSAGE = "Purchases aren't available in your country yet. You can still play for free!";

/** Blank uses the default. `none` allows every country. Any other value replaces the default. */
export function blockedPurchaseCountries(value: string | undefined): ReadonlySet<string> {
  if (value === undefined || value.trim() === "") return new Set(DEFAULT_PAID_BLOCKED_COUNTRIES);
  if (value.trim().toLowerCase() === "none") return new Set();
  const codes = value.split(",").map((code) => code.trim().toUpperCase()).filter(Boolean);
  if (codes.length === 0 || codes.some((code) => !isCountryCode(code))) {
    return new Set(DEFAULT_PAID_BLOCKED_COUNTRIES);
  }
  return new Set(codes);
}

export function requestCountry(request: Request): string | null {
  const cf = (request as Request & { cf?: { country?: string } }).cf;
  const country = typeof cf?.country === "string" ? cf.country.toUpperCase() : "";
  return isCountryCode(country) ? country : null;
}
