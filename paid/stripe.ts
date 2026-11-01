import { PaidError } from "./errors.ts";

const TOLERANCE_SECONDS = 300;
const SESSION_ID = /^cs_test_[A-Za-z0-9_]+$/;
const EVENT_ID = /^evt_[A-Za-z0-9_]+$/;
const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9_]+$/;

export type CheckoutParamsInput = Readonly<{
  orderId: string;
  productName: string;
  amountMinor: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
  waiverText: string | null;
}>;

export type NormalizedStripeEvent = Readonly<{
  id: string;
  type: string;
  livemode: boolean;
  orderId: string | null;
  sessionId: string | null;
  paymentIntentId: string | null;
  paymentStatus: string | null;
  currency: string | null;
  amountTotal: number | null;
  amountRefunded: number | null;
  fullyRefunded: boolean;
}>;

export function assertStripeTestConfiguration(mode: string, secretKey: string): void {
  if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) {
    throw new PaidError("stripe_live_key_rejected", 503);
  }
  if (mode === "mock") return;
  if (mode !== "test" || !secretKey.startsWith("sk_test_")) {
    throw new PaidError("stripe_test_mode_required", 503);
  }
}

/** Stripe signs `timestamp.body` with the webhook secret as a UTF-8 HMAC key. */
export function checkoutSessionParams(input: CheckoutParamsInput): URLSearchParams {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("client_reference_id", input.orderId);
  params.set("customer_email", input.customerEmail);
  params.set("customer_creation", "if_required");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("billing_address_collection", "required");
  params.set("adaptive_pricing[enabled]", "true");
  params.set("automatic_tax[enabled]", "true");
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "gbp");
  params.set("line_items[0][price_data][unit_amount]", String(input.amountMinor));
  params.set("line_items[0][price_data][tax_behavior]", "exclusive");
  params.set("line_items[0][price_data][product_data][name]", input.productName);
  params.set("metadata[order_id]", input.orderId);
  params.set("payment_intent_data[metadata][order_id]", input.orderId);
  if (input.waiverText) params.set("custom_text[submit][message]", input.waiverText.slice(0, 1200));
  return params;
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs: number,
): Promise<void> {
  if (!header || !secret) throw new PaidError("stripe_signature_missing", 400);
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const splitAt = part.indexOf("=");
    if (splitAt <= 0) continue;
    const key = part.slice(0, splitAt);
    const value = part.slice(splitAt + 1);
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }
  if (!/^\d{1,12}$/.test(timestamp) || signatures.length === 0) {
    throw new PaidError("stripe_signature_invalid", 400);
  }
  const age = Math.abs(Math.floor(nowMs / 1000) - Number(timestamp));
  if (age > TOLERANCE_SECONDS) throw new PaidError("stripe_signature_expired", 400);
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!signatures.some((candidate) => timingSafeEqualHex(candidate, expected))) {
    throw new PaidError("stripe_signature_invalid", 400);
  }
}

function paymentIntentId(value: unknown): string | null {
  const candidate = typeof value === "string" ? value : value && typeof value === "object" && "id" in value ? (value as { id: unknown }).id : null;
  return typeof candidate === "string" && PAYMENT_INTENT_ID.test(candidate) ? candidate : null;
}

function integerAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000 ? value : null;
}

export function parseStripeEvent(rawBody: string): NormalizedStripeEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new PaidError("stripe_event_invalid", 400);
  }
  if (!parsed || typeof parsed !== "object") throw new PaidError("stripe_event_invalid", 400);
  const event = parsed as Record<string, unknown>;
  const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : null;
  const object = data?.object && typeof data.object === "object" ? data.object as Record<string, unknown> : null;
  if (typeof event.id !== "string" || !EVENT_ID.test(event.id) || typeof event.type !== "string" || !object) {
    throw new PaidError("stripe_event_invalid", 400);
  }
  const checkout = event.type.startsWith("checkout.session.");
  const sessionId = checkout && typeof object.id === "string" && SESSION_ID.test(object.id) ? object.id : null;
  if (checkout && typeof object.id === "string" && object.id.startsWith("cs_live_")) {
    throw new PaidError("stripe_live_event_rejected", 400);
  }
  const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata as Record<string, unknown> : {};
  const orderFromMetadata = typeof metadata.order_id === "string" ? metadata.order_id : null;
  const clientReference = typeof object.client_reference_id === "string" ? object.client_reference_id : null;
  return Object.freeze({
    id: event.id,
    type: event.type,
    livemode: event.livemode === true,
    orderId: checkout ? clientReference || orderFromMetadata : orderFromMetadata,
    sessionId,
    paymentIntentId: paymentIntentId(object.payment_intent),
    paymentStatus: typeof object.payment_status === "string" ? object.payment_status : null,
    currency: typeof object.currency === "string" ? object.currency.toLowerCase() : null,
    amountTotal: integerAmount(checkout ? object.amount_total : object.amount),
    amountRefunded: integerAmount(object.amount_refunded),
    fullyRefunded: object.refunded === true,
  });
}

export async function createStripeSession(
  secretKey: string,
  params: URLSearchParams,
  idempotencyKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  assertStripeTestConfiguration("test", secretKey);
  const response = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": idempotencyKey,
    },
    body: params.toString(),
  });
  const payload = await response.json().catch(() => null) as { id?: unknown; url?: unknown; error?: unknown } | null;
  if (!response.ok || !payload || typeof payload.id !== "string" || !SESSION_ID.test(payload.id) || typeof payload.url !== "string" || !payload.url.startsWith("https://")) {
    logStripeCheckoutFailure(response.status, payload);
    throw new PaidError("stripe_checkout_unavailable", 502);
  }
  return { id: payload.id, url: payload.url };
}

function redactSecrets(value: string): string {
  return value
    .replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/rk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
    .slice(0, 300);
}

function logStripeCheckoutFailure(status: number, payload: { error?: unknown } | null): void {
  const error = payload?.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
  const code = typeof error.code === "string" ? redactSecrets(error.code) : "";
  const type = typeof error.type === "string" ? redactSecrets(error.type) : "";
  const message = typeof error.message === "string" ? redactSecrets(error.message) : "";
  console.error(JSON.stringify({ level: "error", event: "stripe_checkout_unavailable", status, code, type, message }));
}
