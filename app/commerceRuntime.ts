import { deriveCommerceOwnerHash, validateCommerceConfiguration, type CommerceConfiguration } from "../db/commerceContracts.ts";
import { CommerceService, D1CommerceRepository, InMemoryCommerceRateLimiter, InMemoryCommerceRepository, UnavailableCommerceRateLimiter, createReviewCommerceConfig } from "../db/commerce.ts";
import { D1ResultCompletionRepository, ResultCompletionService } from "../db/resultCompletion.ts";
import { activeFeatureFlags } from "./featureFlags.ts";

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
    const config = createReviewCommerceConfig(); return Object.freeze({ service:new CommerceService(repository,new InMemoryCommerceRateLimiter(),config),resultCompletionService:null,config });
  })();
  return reviewRuntimePromise;
}

function productionConfig(runtime: Record<string, unknown>): CommerceConfiguration | null {
  try { return validateCommerceConfiguration({ publicPaymentLinkUrl:runtime.STRIPE_PAYMENT_LINK_URL,expectedPaymentLinkId:runtime.STRIPE_PAYMENT_LINK_ID,webhookSigningSecret:runtime.STRIPE_WEBHOOK_SIGNING_SECRET,expectedProductKey:runtime.ROYAL_REVEAL_PRODUCT_KEY,expectedAmountMinor:Number(runtime.ROYAL_REVEAL_AMOUNT_MINOR),expectedCurrency:runtime.ROYAL_REVEAL_CURRENCY,expectedLivemode:runtime.STRIPE_EXPECTED_LIVEMODE === "true" }); }
  catch { return null; }
}

export async function getCommerceRuntime(): Promise<CommerceRuntime | null> {
  if (!activeFeatureFlags.commerce) return null;
  if (reviewEnabled) return reviewRuntime();
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, unknown> & { DB?: D1Database }; const config = productionConfig(runtime);
  if (!runtime.DB || !config) return null;
  return Object.freeze({
    service:new CommerceService(new D1CommerceRepository(runtime.DB),new UnavailableCommerceRateLimiter(),config),
    resultCompletionService:new ResultCompletionService(new D1ResultCompletionRepository(runtime.DB)),
    config,
  });
}

export const commerceReviewContext = Object.freeze({ enabled:reviewEnabled,resultSlug:reviewEnabled?reviewResultSlug:null,anonymousSessionCredential:reviewEnabled?reviewCredential:null });
