declare const __WYBP_FEATURE_FLAGS__: { commerce?: boolean } | undefined;
declare const __WYBP_RANDOM_BANK__: boolean | undefined;

/** Baked in at build time. The paid Worker shell sets commerce on. */
export function paidCommerceEnabled(): boolean {
  return typeof __WYBP_FEATURE_FLAGS__ !== "undefined" && __WYBP_FEATURE_FLAGS__.commerce === true;
}

/** Paid shell only. The ordinary build leaves this off so the classic 12 stay in place. */
export function randomBankEnabled(): boolean {
  return typeof __WYBP_RANDOM_BANK__ !== "undefined" && __WYBP_RANDOM_BANK__ === true;
}
