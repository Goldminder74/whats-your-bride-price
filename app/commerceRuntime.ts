import { deriveCommerceOwnerHash, validateCommerceConfiguration, type CommerceConfiguration } from "../db/commerceContracts.ts";
import { CommerceService, D1CommerceRepository, InMemoryCommerceRateLimiter, InMemoryCommerceRepository, UnavailableCommerceRateLimiter, createReviewCommerceConfig } from "../db/commerce.ts";
import { D1ResultCompletionRepository, ResultCompletionService } from "../db/resultCompletion.ts";
import { activeFeatureFlags } from "./featureFlags.ts";
import { cowrieProducts, cowrieProductKeys, type CowrieProductKey } from "../db/cowrieProducts.ts";
import type { CowrieBundleConfiguration } from "../db/commerceContracts.ts";
import { loadCommerceConfiguration } from "../db/commerceConfiguration.ts";
import { D1CommerceRateLimiter } from "../db/commerceRateLimit.ts";
import { privateTestProfile, privateTestRuntimeReady } from "./privateTestProfile.ts";

declare const __WYBP_REVIEW_COMMERCE_FIXTURES__: boolean | undefined;
const reviewEnabled = typeof __WYBP_REVIEW_COMMERCE_FIXTURES__ === "boolean" && __WYBP_REVIEW_COMMERCE_FIXTURES__;
const reviewCredential = "01".repeat(16);
const reviewResultSlug = "d".repeat(48);

export type CommerceRuntime = Readonly<{
  service: CommerceService;
  resultCompletionService: ResultCompletionService | null;
  config: CommerceConfiguration;
}>;
let reviewRuntimePromise: Promise<CommerceRuntime> | null = null;

async function reviewRuntime(): Promise<CommerceRuntime> {
  if (reviewRuntimePromise) return reviewRuntimePromise;
  reviewRuntimePromise = (async () => {
    const repository = new InMemoryCommerceRepository(); const ownerHash = await deriveCommerceOwnerHash(reviewCredential); const now = Date.now();
    repository.results.set(reviewResultSlug, Object.freeze({ id:"review_result_royal_reveal",publicSlug:reviewResultSlug,edition:"west",score:10,total:12,resultTitle:"Bride Price Royalty",avatarId:"adjoa",state:"active",expiresAt:now+86_400_000,attemptStatus:"completed",attemptCompletedAt:now-1_000,attemptExpiresAt:now+86_400_000,anonymousOwnerHash:ownerHash }));
    const cowries = activeFeatureFlags.cowrie_economy && activeFeatureFlags.random_quick_play;
    let config = createReviewCommerceConfig();
    if (cowries) {
      const { getReviewCowrieWallet, getReviewCowrieWalletById } = await import("./cowrieReviewRuntime.ts");
      repository.getWalletByReference = async reference => { const row = getReviewCowrieWallet(reference); return row ? { ...row } : null; };
      repository.getWalletById = async id => { const row = getReviewCowrieWalletById(id); return row ? { ...row } : null; };
      repository.eligibleRegionCounts = { west:30,east:30,north:30,central:30,south:30 };
      const bundles = {} as Record<CowrieProductKey,CowrieBundleConfiguration>;
      for (const key of cowrieProductKeys) bundles[key] = {publicPaymentLinkUrl:`https://buy.stripe.com/test_review_${key}`,expectedPaymentLinkId:`plink_review_${key}`,expectedProductKey:key,expectedQuantity:cowrieProducts[key].quantity,expectedAmountMinor:cowrieProducts[key].amountMinor,expectedCurrency:"GBP",expectedLivemode:false};
      config = validateCommerceConfiguration({...config,cowrieBundles:bundles});
    }
    return Object.freeze({ service:new CommerceService(repository,new InMemoryCommerceRateLimiter(),config,Date.now,{cowriePurchasesEnabled:cowries}),resultCompletionService:null,config });
  })();
  return reviewRuntimePromise;
}


export async function getCommerceRuntime(): Promise<CommerceRuntime | null> {
  if (!activeFeatureFlags.commerce) return null;
  if (reviewEnabled) return reviewRuntime();
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, unknown> & { DB?: D1Database }; const config = loadCommerceConfiguration(runtime, activeFeatureFlags.cowrie_economy && activeFeatureFlags.random_quick_play);
  if (privateTestProfile !== "off" && (!privateTestRuntimeReady(runtime) || config?.expectedLivemode !== false)) return null;
  if (!runtime.DB || !config) return null;
  return Object.freeze({
    service:new CommerceService(new D1CommerceRepository(runtime.DB),(privateTestProfile === "payments" ? new D1CommerceRateLimiter(runtime.DB) : new UnavailableCommerceRateLimiter()),config,Date.now,{cowriePurchasesEnabled:activeFeatureFlags.cowrie_economy && activeFeatureFlags.random_quick_play}),
    resultCompletionService:new ResultCompletionService(new D1ResultCompletionRepository(runtime.DB)),
    config,
  });
}

export const commerceReviewContext = Object.freeze({ enabled:reviewEnabled,resultSlug:reviewEnabled?reviewResultSlug:null,anonymousSessionCredential:reviewEnabled?reviewCredential:null });
