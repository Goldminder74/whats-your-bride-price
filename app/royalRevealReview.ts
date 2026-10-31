import { activeFeatureFlags } from "./featureFlags.ts";
declare const __WYBP_REVIEW_COMMERCE_FIXTURES__: boolean|undefined;
export const royalRevealReviewScenarios=["offer","consent_unchecked","consent_error","processing","succeeded","failed","active","refunded","portraits","certificate","unsupported_video"] as const;
export type RoyalRevealReviewScenario=(typeof royalRevealReviewScenarios)[number];
export const royalRevealReviewEnabled=activeFeatureFlags.commerce&&typeof __WYBP_REVIEW_COMMERCE_FIXTURES__==="boolean"&&__WYBP_REVIEW_COMMERCE_FIXTURES__;
export function resolveRoyalRevealReviewScenario(value:unknown):RoyalRevealReviewScenario|undefined{return royalRevealReviewEnabled&&typeof value==="string"&&royalRevealReviewScenarios.includes(value as RoyalRevealReviewScenario)?value as RoyalRevealReviewScenario:undefined;}
export const royalRevealReviewContext=Object.freeze({resultSlug:"d".repeat(48),anonymousSessionCredential:"01".repeat(16)});
