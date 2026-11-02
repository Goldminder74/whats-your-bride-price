/**
 * Base prices are GBP minor units, matching the published one-off prices.
 * Stripe Adaptive Pricing may present the same price in another currency.
 * Stripe Tax is off unless STRIPE_AUTOMATIC_TAX=on. The price shown is the final price.
 */
export const products = Object.freeze({
  cowrie_5_v1: Object.freeze({ name: "5 Cowries", amountMinor: 199, quantity: 5, kind: "cowries" as const, displayPrice: "£1.99", forSale: true }),
  cowrie_15_v1: Object.freeze({ name: "15 Cowries", amountMinor: 499, quantity: 15, kind: "cowries" as const, displayPrice: "£4.99", forSale: true }),
  cowrie_40_v1: Object.freeze({ name: "40 Cowries", amountMinor: 999, quantity: 40, kind: "cowries" as const, displayPrice: "£9.99", forSale: true }),
  royal_reveal_v1: Object.freeze({ name: "Royal Reveal Pack", amountMinor: 199, quantity: 1, kind: "royal_reveal" as const, displayPrice: "£1.99", forSale: true }),
  cowrie_welcome_v1: Object.freeze({ name: "Welcome bonus", amountMinor: 0, quantity: 5, kind: "cowries" as const, displayPrice: "", forSale: false }),
  cowrie_earn_v1: Object.freeze({ name: "Earned Cowrie", amountMinor: 0, quantity: 1, kind: "cowries" as const, displayPrice: "", forSale: false }),
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
export const ROYAL_WAIVER_VERSION = "instant-digital-royal-reveal-waiver-2026-11-02";

export const FREE_COMPLETED_GAMES = 2;
export const GAME_COST_COWRIES = 5;
export const WELCOME_BONUS_COWRIES = 5;
export const WELCOME_BONUS_MS = 14 * 24 * 60 * 60 * 1000;

export function gamesInBundle(quantity: number): number {
  return Math.floor(quantity / GAME_COST_COWRIES);
}

/** Shown at Cowrie checkout and repeated on the receipt for UK, EU and EEA buyers. */
export const WAIVER_TEXT = "I want my Cowries straight away. I understand that once they're delivered I lose my 14-day right to cancel, unless they're faulty or not as described.";

/** Shown at Royal Reveal checkout and repeated on that receipt for UK, EU and EEA buyers. */
export const ROYAL_WAIVER_TEXT = "I want my Royal Reveal Pack straight away. I understand that once it's delivered I lose my 14-day right to cancel, unless it's faulty or not as described.";

export function consentForProduct(kind: "cowries" | "royal_reveal"): { version: string; text: string } {
  if (kind === "royal_reveal") return { version: ROYAL_WAIVER_VERSION, text: ROYAL_WAIVER_TEXT };
  return { version: WAIVER_VERSION, text: WAIVER_TEXT };
}

export function waiverTextForVersion(version: string | null): string | null {
  if (version === WAIVER_VERSION) return WAIVER_TEXT;
  if (version === ROYAL_WAIVER_VERSION) return ROYAL_WAIVER_TEXT;
  return null;
}

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
