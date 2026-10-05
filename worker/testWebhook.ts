import { PRIVATE_TEST, privateTestRuntimeReady, type PrivateTestProfile } from "../app/privateTestProfile.ts";
import { loadCommerceConfiguration } from "../db/commerceConfiguration.ts";
import { CommerceService, D1CommerceRepository, UnavailableCommerceRateLimiter } from "../db/commerce.ts";
import { CommerceValidationError, STRIPE_WEBHOOK_MAX_BODY_BYTES, verifyStripeWebhook } from "../db/commerceContracts.ts";
import { commerceJson, readLimitedCommerceBody } from "../app/commerceHttp.ts";

export const TEST_WEBHOOK_PATH = "/commerce/stripe-test-webhook";
/** No Netlify authentication exception applies to application routes or assets. */
export async function testWebhook(request: Request, env: Record<string, unknown>, profile: PrivateTestProfile,
  now: () => number = Date.now): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.origin !== PRIVATE_TEST.workerOrigin || url.pathname !== TEST_WEBHOOK_PATH
    || url.search || profile !== "payments" || env.WYBP_TEST_WEBHOOK_ENABLED !== "true"
    || !privateTestRuntimeReady(env, profile)) return commerceJson({ received: false }, 404);
  if ((request.headers.get("content-type") || "").split(";", 1)[0].trim() !== "application/json") return commerceJson({ received: false }, 400);
  const config = loadCommerceConfiguration(env, true);
  if (!config || config.expectedLivemode !== false) return commerceJson({ received: false }, 503);
  try {
    const rawBody = await readLimitedCommerceBody(request, STRIPE_WEBHOOK_MAX_BODY_BYTES);
    const repository = new D1CommerceRepository(env.DB as D1Database);
    const service = new CommerceService(repository, new UnavailableCommerceRateLimiter(), config, now, { cowriePurchasesEnabled: true });
    // The verifier authenticates the unmodified body before any authoritative reconciliation/query.
    const event = await verifyStripeWebhook({ rawBody, signatureHeader: request.headers.get("stripe-signature"), config,
      now: now(), resolveLegacyPaymentIntent: raw => service.resolveLegacyPaymentIntent(raw) });
    await service.webhook(event);
    return commerceJson({ received: true }, 200);
  } catch (error) {
    return commerceJson({ received: false }, error instanceof CommerceValidationError
      && !error.code.includes("processing_unavailable") ? 400 : 503);
  }
}
