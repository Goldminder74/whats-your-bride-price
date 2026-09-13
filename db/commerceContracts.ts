import { deriveAnonymousSubjectHash } from "../app/anonymousSession.ts";
import { constantTimeEqual } from "./deletionReadiness.ts";
import { COWRIE_DELIVERY_NOTICE_VERSION, cowrieProducts, cowrieProductKeys, isCowrieProduct, type CowrieProductKey } from "./cowrieProducts.ts";

export const ROYAL_REVEAL_PRODUCT_KEY = "royal_reveal_v1" as const;
export const ROYAL_REVEAL_CURRENCY = "GBP" as const;
export const ROYAL_REVEAL_AMOUNT_MINOR = 199 as const;
export const ROYAL_REVEAL_DISPLAY_PRICE = "£1.99" as const;
export const ROYAL_REVEAL_CONSENT_NOTICE_VERSION = "royal-reveal-immediate-delivery-v1" as const;
export const COMMERCE_MAX_BODY_BYTES = 16_384;
export const STRIPE_WEBHOOK_MAX_BODY_BYTES = 65_536;
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
export const PENDING_ORDER_LIFETIME_MS = 30 * 60_000;
export const COMMERCE_RETENTION_MS = 400 * 86_400_000;

const resultSlugPattern = /^[0-9a-f]{48}$/;
const credentialPattern = /^[0-9a-f]{32}$/;
const idempotencyPattern = /^[0-9a-f]{32}$/;
const publicReferencePattern = /^rr_[0-9a-f]{32}$/;
const paymentLinkIdPattern = /^plink_[0-9A-Za-z_]{2,249}$/;
const stripeIdPattern = /^(evt|cs|pi)_[0-9A-Za-z_]{2,250}$/;

export class CommerceValidationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "CommerceValidationError"; this.code = code; }
}
function fail(code: string): never { throw new CommerceValidationError(code); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

export type CommerceConfiguration = Readonly<{
  publicPaymentLinkUrl: string;
  expectedPaymentLinkId: string;
  webhookSigningSecret: string;
  expectedProductKey: typeof ROYAL_REVEAL_PRODUCT_KEY;
  expectedAmountMinor: typeof ROYAL_REVEAL_AMOUNT_MINOR;
  expectedCurrency: typeof ROYAL_REVEAL_CURRENCY;
  expectedLivemode: boolean;
  cowrieBundles?: Readonly<Record<CowrieProductKey, CowrieBundleConfiguration>>;
}>;

export type CowrieBundleConfiguration = Readonly<{
  publicPaymentLinkUrl: string; expectedPaymentLinkId: string; expectedProductKey: CowrieProductKey;
  expectedQuantity: number; expectedAmountMinor: number; expectedCurrency: "GBP"; expectedLivemode: boolean;
}>;

export function validatePaymentLinkUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 2048) return fail("payment_link_invalid");
  let url: URL;
  try { url = new URL(value); } catch { return fail("payment_link_invalid"); }
  if (url.origin !== "https://buy.stripe.com" || url.username || url.password || url.hash || url.search) return fail("payment_link_invalid");
  if (!/^\/[0-9A-Za-z_-]+$/.test(url.pathname)) return fail("payment_link_invalid");
  return url;
}

export function validateCommerceConfiguration(value: unknown): CommerceConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("commerce_configuration_incomplete");
  const candidate = value as Record<string, unknown>;
  if (!exactKeys(candidate, ["publicPaymentLinkUrl", "expectedPaymentLinkId", "webhookSigningSecret", "expectedProductKey", "expectedAmountMinor", "expectedCurrency", "expectedLivemode", ...(candidate.cowrieBundles === undefined ? [] : ["cowrieBundles"])])) return fail("commerce_configuration_incomplete");
  validatePaymentLinkUrl(candidate.publicPaymentLinkUrl);
  if (typeof candidate.expectedPaymentLinkId !== "string" || !paymentLinkIdPattern.test(candidate.expectedPaymentLinkId)) return fail("payment_link_id_invalid");
  if (typeof candidate.webhookSigningSecret !== "string" || !/^whsec_[0-9A-Za-z_]{16,255}$/.test(candidate.webhookSigningSecret)) return fail("webhook_secret_invalid");
  if (candidate.expectedProductKey !== ROYAL_REVEAL_PRODUCT_KEY || candidate.expectedAmountMinor !== ROYAL_REVEAL_AMOUNT_MINOR || candidate.expectedCurrency !== ROYAL_REVEAL_CURRENCY || typeof candidate.expectedLivemode !== "boolean") return fail("commerce_configuration_mismatch");
  if (candidate.cowrieBundles !== undefined) {
    if (!candidate.cowrieBundles || typeof candidate.cowrieBundles !== "object" || Array.isArray(candidate.cowrieBundles) || !exactKeys(candidate.cowrieBundles as Record<string, unknown>, cowrieProductKeys)) return fail("cowrie_configuration_incomplete");
    const links = new Set([candidate.expectedPaymentLinkId]); const urls = new Set([candidate.publicPaymentLinkUrl]);
    for (const key of cowrieProductKeys) {
      const bundle = (candidate.cowrieBundles as Record<string, CowrieBundleConfiguration>)[key]; const product = cowrieProducts[key];
      if (!bundle || !exactKeys(bundle as unknown as Record<string, unknown>, ["publicPaymentLinkUrl","expectedPaymentLinkId","expectedProductKey","expectedQuantity","expectedAmountMinor","expectedCurrency","expectedLivemode"])) return fail("cowrie_configuration_incomplete");
      validatePaymentLinkUrl(bundle.publicPaymentLinkUrl);
      if (!paymentLinkIdPattern.test(bundle.expectedPaymentLinkId) || links.has(bundle.expectedPaymentLinkId) || urls.has(bundle.publicPaymentLinkUrl) || bundle.expectedProductKey !== key || bundle.expectedQuantity !== product.quantity || bundle.expectedAmountMinor !== product.amountMinor || bundle.expectedCurrency !== "GBP" || bundle.expectedLivemode !== candidate.expectedLivemode) return fail("cowrie_configuration_mismatch");
      links.add(bundle.expectedPaymentLinkId); urls.add(bundle.publicPaymentLinkUrl);
    }
  }
  return Object.freeze(candidate as CommerceConfiguration);
}

export type RoyalStartOrderRequest = Readonly<{
  productKey: typeof ROYAL_REVEAL_PRODUCT_KEY;
  resultSlug: string;
  anonymousSessionCredential: string;
  idempotencyKey: string;
  immediateDeliveryConsent: true;
  consentNoticeVersion: typeof ROYAL_REVEAL_CONSENT_NOTICE_VERSION;
}>;
export type CowrieStartOrderRequest = Readonly<{ productKey: CowrieProductKey; walletReference: string; anonymousSessionCredential: string; idempotencyKey: string; immediateDeliveryConsent: true; consentNoticeVersion: typeof COWRIE_DELIVERY_NOTICE_VERSION }>;
export type StartOrderRequest = RoyalStartOrderRequest | CowrieStartOrderRequest;

export function validateStartOrderRequest(value: unknown): StartOrderRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("order_request_invalid");
  const candidate = value as Record<string, unknown>;
  if (isCowrieProduct(candidate.productKey)) {
    if (!exactKeys(candidate,["productKey","walletReference","anonymousSessionCredential","idempotencyKey","immediateDeliveryConsent","consentNoticeVersion"])) return fail("order_request_field_not_allowed");
    if (typeof candidate.walletReference !== "string" || !/^cw_[0-9a-f]{32}$/.test(candidate.walletReference) || typeof candidate.anonymousSessionCredential !== "string" || !credentialPattern.test(candidate.anonymousSessionCredential)) return fail("wallet_unavailable");
    if (typeof candidate.idempotencyKey !== "string" || !idempotencyPattern.test(candidate.idempotencyKey)) return fail("idempotency_key_invalid");
    if (candidate.immediateDeliveryConsent !== true || candidate.consentNoticeVersion !== COWRIE_DELIVERY_NOTICE_VERSION) return fail("immediate_delivery_consent_required");
    return Object.freeze(candidate as CowrieStartOrderRequest);
  }
  if (!exactKeys(candidate, ["productKey", "resultSlug", "anonymousSessionCredential", "idempotencyKey", "immediateDeliveryConsent", "consentNoticeVersion"])) return fail("order_request_field_not_allowed");
  if (candidate.productKey !== ROYAL_REVEAL_PRODUCT_KEY) return fail("product_invalid");
  if (typeof candidate.resultSlug !== "string" || !resultSlugPattern.test(candidate.resultSlug)) return fail("result_unavailable");
  if (typeof candidate.anonymousSessionCredential !== "string" || !credentialPattern.test(candidate.anonymousSessionCredential)) return fail("result_unavailable");
  if (typeof candidate.idempotencyKey !== "string" || !idempotencyPattern.test(candidate.idempotencyKey)) return fail("idempotency_key_invalid");
  if (candidate.immediateDeliveryConsent !== true || candidate.consentNoticeVersion !== ROYAL_REVEAL_CONSENT_NOTICE_VERSION) return fail("immediate_delivery_consent_required");
  return Object.freeze(candidate as RoyalStartOrderRequest);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function derivePaymentIntentHash(raw: string): Promise<string> {
  if (!/^pi_[0-9A-Za-z_]{2,252}$/.test(raw)) return fail("stripe_payment_mismatch");
  return sha256(`wybp:stripe-payment-intent-reconciliation:v1\u0000${raw}`);
}
export function deriveCowrieOrderIdempotencyHash(input: Readonly<{ rawKey: string; ownerHash: string; walletId: string; productKey: CowrieProductKey }>): Promise<string> {
  if (!idempotencyPattern.test(input.rawKey) || !/^[0-9a-f]{64}$/.test(input.ownerHash) || !/^wallet_[0-9a-f]{32}$/.test(input.walletId) || !isCowrieProduct(input.productKey)) return fail("idempotency_key_invalid");
  return sha256(`wybp:commerce-cowrie-order:v1\u0000${input.ownerHash}\u0000${input.walletId}\u0000${input.productKey}\u0000${input.rawKey}`);
}

export async function deriveCommerceOwnerHash(rawCredential: unknown): Promise<string> {
  if (typeof rawCredential !== "string" || !credentialPattern.test(rawCredential)) return fail("result_unavailable");
  const hash = await deriveAnonymousSubjectHash(rawCredential);
  if (!hash) return fail("result_unavailable");
  return hash;
}

export async function deriveOrderIdempotencyHash(input: Readonly<{ rawKey: string; ownerHash: string; resultId: string }>): Promise<string> {
  if (!idempotencyPattern.test(input.rawKey) || !/^[0-9a-f]{64}$/.test(input.ownerHash) || !input.resultId) return fail("idempotency_key_invalid");
  return sha256(`wybp:commerce-order-idempotency:v1\u0000${input.ownerHash}\u0000${input.resultId}\u0000${ROYAL_REVEAL_PRODUCT_KEY}\u0000${input.rawKey}`);
}

export function securePublicOrderReference(cryptoApi: Pick<Crypto, "getRandomValues"> = crypto): string {
  const bytes = new Uint8Array(16); cryptoApi.getRandomValues(bytes);
  return `rr_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function constructPaymentLinkUrl(base: string, clientReferenceId: string): string {
  const url = validatePaymentLinkUrl(base);
  if (!publicReferencePattern.test(clientReferenceId)) return fail("client_reference_invalid");
  url.searchParams.set("client_reference_id", clientReferenceId);
  return url.toString();
}

export function constantTimeOwnerMatch(storedHash: string | null, derivedHash: string): boolean {
  if (!storedHash || !/^[0-9a-f]{64}$/.test(storedHash) || !/^[0-9a-f]{64}$/.test(derivedHash)) return false;
  return constantTimeEqual(Uint8Array.from(storedHash.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16)), Uint8Array.from(derivedHash.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16)));
}

export const STRIPE_EVENT_TYPES = Object.freeze([
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "charge.refunded", "charge.dispute.created",
] as const);
export type StripeEventType = (typeof STRIPE_EVENT_TYPES)[number];

export type VerifiedStripeEvent = Readonly<{
  stripeEventId: string;
  eventType: StripeEventType;
  livemode: boolean;
  payloadSha256: string;
  clientReferenceId: string | null;
  checkoutSessionId: string | null;
  paymentIntentHash: string | null;
  paymentStatus: "paid" | "unpaid" | "no_payment_required" | null;
  amountTotal: number | null;
  amountRefunded: number | null;
  currency: string | null;
  paymentLinkId: string | null;
  mode: string | null;
}>;
const verifiedStripeEvents = new WeakSet<object>();
export function requireVerifiedStripeEvent(event: VerifiedStripeEvent): void {
  if (!verifiedStripeEvents.has(event)) return fail("stripe_event_unverified");
}

function parseSignatureHeader(header: string): Readonly<{ timestamp: number; signatures: readonly string[] }> {
  const entries = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = Number(entries.find(([key]) => key === "t")?.[1]);
  const signatures = entries.filter(([key, value]) => key === "v1" && /^[0-9a-f]{64}$/.test(value || "")).map(([, value]) => value as string);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || signatures.length === 0) return fail("stripe_signature_invalid");
  return Object.freeze({ timestamp, signatures: Object.freeze(signatures) });
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  let difference = 0; for (let index = 0; index < 64; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyStripeWebhook(input: Readonly<{ rawBody: string; signatureHeader: string | null; config: CommerceConfiguration; now?: number; resolveLegacyPaymentIntent?: (raw: string) => Promise<string | null> }>): Promise<VerifiedStripeEvent> {
  if (!input.rawBody || new TextEncoder().encode(input.rawBody).byteLength > STRIPE_WEBHOOK_MAX_BODY_BYTES || !input.signatureHeader) return fail("stripe_signature_invalid");
  const signature = parseSignatureHeader(input.signatureHeader);
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - signature.timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return fail("stripe_signature_expired");
  const expected = await hmacHex(input.config.webhookSigningSecret, `${signature.timestamp}.${input.rawBody}`);
  if (!signature.signatures.some((candidate) => constantTimeHex(candidate, expected))) return fail("stripe_signature_invalid");
  let parsed: unknown; try { parsed = JSON.parse(input.rawBody); } catch { return fail("stripe_payload_invalid"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("stripe_payload_invalid");
  const event = parsed as Record<string, unknown>;
  if (typeof event.id !== "string" || !stripeIdPattern.test(event.id) || !STRIPE_EVENT_TYPES.includes(event.type as StripeEventType) || typeof event.livemode !== "boolean" || event.livemode !== input.config.expectedLivemode) return fail("stripe_event_invalid");
  const data = event.data as Record<string, unknown> | undefined; const object = data?.object as Record<string, unknown> | undefined;
  if (!object || typeof object !== "object" || Array.isArray(object) || !/^evt_[0-9A-Za-z_]{2,251}$/.test(event.id)) return fail("stripe_payload_invalid");
  const checkout = String(event.type).startsWith("checkout.session.");
  const clientReferenceId = checkout && typeof object.client_reference_id === "string" ? object.client_reference_id : null;
  const checkoutSessionId = checkout && typeof object.id === "string" && /^cs_/.test(object.id) ? object.id : null;
  const paymentIntentId = typeof object.payment_intent === "string" && /^pi_/.test(object.payment_intent) ? object.payment_intent : null;
  const expectedBundle = checkout ? Object.values(input.config.cowrieBundles || {}).find(bundle => bundle.expectedPaymentLinkId === object.payment_link) : undefined;
  const expectedAmount = expectedBundle?.expectedAmountMinor ?? input.config.expectedAmountMinor;
  const expectedLink = expectedBundle?.expectedPaymentLinkId ?? input.config.expectedPaymentLinkId;
  const amount = checkout ? object.amount_total : object.amount;
  if (!Number.isSafeInteger(amount) || (amount as number) < 0 || (amount as number) > 9007199254740991 || (paymentIntentId !== null && !/^pi_[0-9A-Za-z_]{2,250}$/.test(paymentIntentId)) || (!paymentIntentId && (!checkout || object.payment_status === "paid" || object.payment_intent !== null))) return fail("stripe_payment_mismatch");
  if (event.type === "charge.refunded" && (!Number.isSafeInteger(object.amount_refunded) || (object.amount_refunded as number) < 0 || (object.amount_refunded as number) > (amount as number))) return fail("stripe_payment_mismatch");
  const normalized = {
    stripeEventId: event.id, eventType: event.type as StripeEventType, livemode: event.livemode,
    payloadSha256: await sha256(input.rawBody), clientReferenceId, checkoutSessionId, paymentIntentHash: null as string | null,
    paymentStatus: checkout && ["paid", "unpaid", "no_payment_required"].includes(String(object.payment_status)) ? object.payment_status as VerifiedStripeEvent["paymentStatus"] : null,
    amountTotal: Number.isSafeInteger(checkout ? object.amount_total : object.amount)
      ? (checkout ? object.amount_total : object.amount) as number
      : null,
    amountRefunded: event.type === "charge.refunded" ? object.amount_refunded as number : null,
    currency: typeof object.currency === "string" ? object.currency.toUpperCase() : null,
    paymentLinkId: checkout && typeof object.payment_link === "string" ? object.payment_link : null,
    mode: checkout && typeof object.mode === "string" ? object.mode : null,
  };
  if (checkout && (!publicReferencePattern.test(normalized.clientReferenceId || "") || !/^cs_[0-9A-Za-z_]{2,252}$/.test(normalized.checkoutSessionId || "") || normalized.paymentLinkId !== expectedLink || normalized.amountTotal !== expectedAmount || normalized.currency !== "GBP" || normalized.mode !== "payment" || normalized.paymentStatus === null)) return fail("stripe_checkout_mismatch");
  if ((event.type === "checkout.session.async_payment_succeeded" && normalized.paymentStatus !== "paid") || (event.type === "checkout.session.async_payment_failed" && normalized.paymentStatus !== "unpaid") || (!checkout && (typeof object.id !== "string" || !(event.type === "charge.refunded" ? /^ch_[0-9A-Za-z_]{2,250}$/ : /^dp_[0-9A-Za-z_]{2,250}$/).test(object.id)))) return fail("stripe_payment_mismatch");
  if (!checkout && (normalized.currency !== "GBP" || (event.type === "charge.refunded" ? ![199,...Object.values(input.config.cowrieBundles || {}).map(bundle=>bundle.expectedAmountMinor)].includes(amount as number) : (amount as number) > (input.config.cowrieBundles ? 999 : 199)))) return fail("stripe_payment_mismatch");
  normalized.paymentIntentHash = paymentIntentId ? await derivePaymentIntentHash(paymentIntentId) : null;
  if (paymentIntentId && input.resolveLegacyPaymentIntent) {const legacy=await input.resolveLegacyPaymentIntent(paymentIntentId);if(checkout && legacy && legacy!==clientReferenceId)return fail("stripe_payment_mismatch");if(!checkout)normalized.clientReferenceId=legacy;}
  const result = Object.freeze(normalized); verifiedStripeEvents.add(result); return result;
}
