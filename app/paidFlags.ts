declare const __WYBP_FEATURE_FLAGS__: { commerce?: boolean } | undefined;

/** Baked in at build time. The paid Worker shell sets commerce on. */
export function paidCommerceEnabled(): boolean {
  return typeof __WYBP_FEATURE_FLAGS__ !== "undefined" && __WYBP_FEATURE_FLAGS__.commerce === true;
}
