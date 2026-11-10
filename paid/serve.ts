import {
  CANONICAL_ORIGIN,
  isCountryCode,
  FREE_COMPLETED_GAMES,
  GAME_COST_COWRIES,
  WELCOME_BONUS_COWRIES,
  WELCOME_BONUS_MS,
  gamesInBundle,
  isProductKey,
  priorityCountries,
  productKeys,
  products,
  requiresWithdrawalWaiver,
  WAIVER_TEXT,
  ROYAL_WAIVER_TEXT,
  ROYAL_WAIVER_VERSION,
  consentForProduct,
  WAIVER_VERSION,
  withdrawalCountries,
  blockedPurchaseCountries,
  PURCHASES_UNAVAILABLE_MESSAGE,
  requestCountry,
} from "./catalog.ts";
import { assertReceiptFrom, type TransactionalEmail } from "./email.ts";
import { PaidError, isPaidError } from "./errors.ts";
import { DISPLAY_NAME_MESSAGE } from "./nickname.ts";
import { applyStripeEvent, projectAccess } from "./fulfillment.ts";
import { SUPPORT_EMAIL } from "./receipt.ts";
import { editions, isEdition, type KvStore } from "./games.ts";
import { handleBoosterFrame, handleBoosterFreeze, handleBoosterOffer, handleBoosterStatus, handleBoosterUse } from "./boosterRoute.ts";
import { handleDailyBegin, handleDailyBoard, handleDailyFinish, handleDailyNickname, handleDailyStatus, handleNicknameRead } from "./dailyRoute.ts";
import { claimReferralIfFirstGame, handlePerfect, handleReferralArrive, handleReferralGet, handleShareCard, handleShareReward } from "./earnRoute.ts";
import { applyChallengeMeta, challengeUrl, shareBlurb, shareCardImageUrl } from "./shareCard.ts";
import { revealHoldFromPurchase, writeRevealHold } from "./royalReveal.ts";
import { handleDecreePreview } from "./decreePreview.ts";
import { handleResultVideoFile, handleResultVideoStory } from "./resultVideoRoute.ts";
import { handleRoyalClaim, handleRoyalFile } from "./royalRevealRoute.ts";
import { isReferralCode } from "./earn.ts";
import { handleQuestionComplete, handleQuestionGet } from "./questionRoute.ts";
import { legalPage, mockCheckoutHtml, playPageHtml, returnHtml } from "./pages.ts";
import { paystackSeam } from "./paystack.ts";
import { assertSpendCount, type PaidOrder, type PaidRepository } from "./repository.ts";
import {
  assertStripeConfiguration,
  assertStripeEventMode,
  automaticTaxEnabled,
  checkoutSessionParams,
  createStripeRefund,
  createStripeSession,
  parseStripeEvent,
  verifyStripeSignature,
  hmacSha256Hex,
  type StripeRuntimeMode,
} from "./stripe.ts";

export type PaidConfig = Readonly<{
  stripeMode: StripeRuntimeMode;
  stripeSecretKey: string;
  webhookSecret: string;
  publicOrigin: string;
  automaticTax: boolean;
}>;

export type PaidServices = Readonly<{
  now: () => number;
  repository: PaidRepository;
  kv: KvStore;
  email: TransactionalEmail;
  replyTo?: string;
  blockedCountries?: ReadonlySet<string>;
  royalRevealEnabled?: boolean;
  ownerStatsToken?: string;
  refundBlockedPayment?: (paymentIntentId: string) => Promise<void>;
  config: PaidConfig | null;
  assets?: { fetch(request: Request): Promise<Response> };
  stripeFetch?: typeof fetch;
  ensureSchema?: () => Promise<void>;
  waitUntil?: (promise: Promise<unknown>) => void;
  /** When true, regional rounds are drawn from the published question bank. */
  randomBank?: boolean;
  /** Perfect-score, share, and referral Cowries. Off unless EARN_PATHS is on. */
  earnPaths?: boolean;
  /** WhatsApp result card. Off unless SHARE_CARDS is on. */
  shareCards?: boolean;
  /** One free daily set per region. Off unless DAILY_CHALLENGE is on. */
  dailyChallenge?: boolean;
  /** Free 5-second result video. Off unless RESULT_VIDEO is on. */
  resultVideo?: boolean;
  /** In-round Cowrie boosters, streak freezes, and cosmetic frames. Off unless BOOSTERS is on. */
  boosters?: boolean;
}>;

const PLAYER_ID = /^[A-Za-z0-9_-]{16,64}$/;
const IDEMPOTENCY = /^[A-Za-z0-9_-]{8,80}$/;
const ORDER_ID = /^ord_[a-f0-9]{32}$/;
/** Public region banks only. Other JSON in the asset directory stays on the Worker. */
const QUESTION_BANK_CHUNK = /^\/question-bank\/(?:west|east|central|north|south)\.json$/;
const STATIC_ASSET = /\.(?:png|webp|svg|ico|webmanifest|css|js|txt|xml|jpg|jpeg|gif|woff2|mp4)$/;

export function isQuestionBankChunk(pathname: string): boolean {
  return QUESTION_BANK_CHUNK.test(pathname);
}

export type PaidEnvConfig = {
  STRIPE_MODE?: string;
  STRIPE_API_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  EMAIL_FROM?: string;
  PUBLIC_APP_ORIGIN?: string;
  STRIPE_AUTOMATIC_TAX?: string;
};

export function readPaidConfig(env: PaidEnvConfig): PaidConfig {
  const requested = (env.STRIPE_MODE || "test").trim().toLowerCase();
  if (requested !== "test" && requested !== "live") throw new PaidError("stripe_not_configured", 503);
  const apiMode = env.STRIPE_API_MODE || "";
  if (apiMode !== "mock" && apiMode !== "test") throw new PaidError("stripe_not_configured", 503);
  if (requested === "live" && apiMode !== "test") throw new PaidError("stripe_mode_mismatch", 503);
  const mode: StripeRuntimeMode = requested === "live" ? "live" : apiMode;
  const secret = env.STRIPE_SECRET_KEY || "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || "";
  if (webhookSecret.length < 16) throw new PaidError("stripe_not_configured", 503);
  assertStripeConfiguration(mode, secret);
  assertReceiptFrom(env.EMAIL_FROM || "");
  const origin = env.PUBLIC_APP_ORIGIN || CANONICAL_ORIGIN;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new PaidError("public_origin_rejected", 503);
  }
  const local = (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.protocol === "http:";
  if (url.origin !== CANONICAL_ORIGIN && !local) throw new PaidError("public_origin_rejected", 503);
  if (url.origin !== origin || url.pathname !== "/" || url.search || url.hash) throw new PaidError("public_origin_rejected", 503);
  return { stripeMode: mode, stripeSecretKey: secret, webhookSecret, publicOrigin: url.origin, automaticTax: automaticTaxEnabled(env.STRIPE_AUTOMATIC_TAX) };
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...Object.fromEntries(new Headers(extra)) },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

async function readJson(request: Request, limit: number): Promise<unknown> {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > limit) throw new PaidError("body_too_large", 413);
  const text = await request.text();
  if (text.length > limit) throw new PaidError("body_too_large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new PaidError("json_invalid", 400);
  }
}

function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new PaidError("origin_rejected", 403);
}

function requireConfig(services: PaidServices): PaidConfig {
  if (!services.config) throw new PaidError("stripe_not_configured", 503);
  return services.config;
}

function orderId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `ord_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

async function rateLimit(services: PaidServices, request: Request): Promise<void> {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const hash = [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const bucket = `rl:${hash}:${Math.floor(services.now() / 60_000)}`;
  const next = Number(await services.kv.get(bucket) || "0") + 1;
  await services.kv.put(bucket, String(next));
  if (next > 30) throw new PaidError("checkout_rate_limited", 429);
}

async function ready(services: PaidServices): Promise<void> {
  if (services.ensureSchema) await services.ensureSchema();
}

function publicOrder(order: PaidOrder, entitlement: { state: string; remaining: number } | null) {
  return {
    id: order.id,
    state: order.state,
    productKey: order.productKey,
    presentmentCurrency: order.presentmentCurrency,
    presentmentAmountMinor: order.presentmentAmountMinor,
    receiptStatus: order.receiptStatus,
    entitlement: entitlement ? { state: entitlement.state, remaining: entitlement.remaining } : null,
  };
}

async function handleCheckout(request: Request, services: PaidServices): Promise<Response> {
  const config = requireConfig(services);
  assertStripeConfiguration(config.stripeMode, config.stripeSecretKey);
  sameOrigin(request);
  await rateLimit(services, request);
  await ready(services);
  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!IDEMPOTENCY.test(idempotencyKey)) throw new PaidError("idempotency_key_required", 400);
  const body = await readJson(request, 8_000) as Record<string, unknown>;
  if (body.provider === "paystack") {
    await paystackSeam.createCheckout({ productKey: String(body.productKey || ""), email: String(body.email || ""), country: String(body.country || "") });
  }
  if (!isProductKey(body.productKey) || !products[body.productKey].forSale) throw new PaidError("product_invalid", 400);
  if (products[body.productKey].kind === "royal_reveal" && !services.royalRevealEnabled) throw new PaidError("royal_reveal_unavailable", 404);
  if (!validEmail(body.email)) throw new PaidError("email_invalid", 400);
  if (!isCountryCode(body.country)) throw new PaidError("country_invalid", 400);
  if (typeof body.playerId !== "string" || !PLAYER_ID.test(body.playerId)) throw new PaidError("player_invalid", 400);
  if (body.adult !== true) throw new PaidError("adult_confirmation_required", 400);
  const blocked = services.blockedCountries ?? blockedPurchaseCountries(undefined);
  const edgeCountry = requestCountry(request);
  if (blocked.has(body.country) || (edgeCountry !== null && blocked.has(edgeCountry))) {
    throw new PaidError("purchases_unavailable_in_country", 403);
  }
  const waiver = body.waiver === true;
  if (requiresWithdrawalWaiver(body.country) && !waiver) throw new PaidError("withdrawal_waiver_required", 400);
  const product = products[body.productKey];
  const consent = consentForProduct(product.kind);
  const revealHold = product.kind === "royal_reveal"
    ? await revealHoldFromPurchase(services.kv, body.playerId, body)
    : null;
  const now = services.now();
  const draft: PaidOrder = {
    id: orderId(),
    idempotencyKey,
    productKey: body.productKey,
    playerId: body.playerId,
    email: body.email,
    residenceCountry: body.country,
    baseCurrency: "gbp",
    baseAmountMinor: product.amountMinor,
    waiverVersion: waiver ? consent.version : null,
    waiverAcceptedAt: waiver ? now : null,
    adultConfirmed: true,
    state: "pending",
    checkoutSessionId: null,
    checkoutUrl: null,
    paymentIntentId: null,
    presentmentCurrency: null,
    presentmentAmountMinor: null,
    receiptStatus: "pending",
    receiptId: null,
    createdAt: now,
    updatedAt: now,
  };
  const order = await services.repository.createPending(draft);
  if (revealHold) await writeRevealHold(services.kv, order.id, revealHold);
  if (order.checkoutUrl) return json({ url: order.checkoutUrl, orderId: order.id, replay: true });
  const requestOrigin = new URL(request.url).origin;
  const params = checkoutSessionParams({
    orderId: order.id,
    productName: product.name,
    amountMinor: product.amountMinor,
    successUrl: `${requestOrigin}/checkout/return?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${requestOrigin}/?checkout=cancelled`,
    customerEmail: order.email,
    waiverText: waiver ? consent.text : null,
    automaticTax: config.automaticTax === true,
  });
  const session = config.stripeMode === "mock"
    ? { id: `cs_test_mock_${order.id.slice(4)}`, url: `${requestOrigin}/checkout/mock?order=${order.id}` }
    : await createStripeSession(config.stripeSecretKey, params, idempotencyKey, config.stripeMode === "live" ? "live" : "test", services.stripeFetch ?? fetch);
  await services.repository.attachSession(order.id, session.id, session.url);
  await services.repository.recordStat("checkout_start", "", now);
  return json({ url: session.url, orderId: order.id, replay: false });
}

async function handleWebhook(request: Request, services: PaidServices): Promise<Response> {
  const config = requireConfig(services);
  await ready(services);
  const raw = await request.text();
  if (raw.length > 65_536) throw new PaidError("body_too_large", 413);
  await verifyStripeSignature(raw, request.headers.get("stripe-signature"), config.webhookSecret, services.now());
  const event = parseStripeEvent(raw);
  assertStripeEventMode(event, config.stripeMode);
  const result = await applyStripeEvent({
    event,
    stripeMode: config.stripeMode,
    repository: services.repository,
    kv: services.kv,
    email: services.email,
    now: services.now(),
    replyTo: services.replyTo || SUPPORT_EMAIL,
    blockedCountries: services.blockedCountries ?? blockedPurchaseCountries(undefined),
    refundBlockedPayment: services.refundBlockedPayment ?? (async (paymentIntentId: string) => {
      if (config.stripeMode === "mock") return;
      await createStripeRefund(config.stripeSecretKey, paymentIntentId, config.stripeMode === "live" ? "live" : "test", services.stripeFetch ?? fetch);
    }),
  });
  return json({ received: true, ...result });
}

async function handleMockPay(request: Request, services: PaidServices): Promise<Response> {
  const config = requireConfig(services);
  if (config.stripeMode !== "mock") throw new PaidError("mock_checkout_disabled", 404);
  sameOrigin(request);
  await ready(services);
  let orderIdValue = "";
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await readJson(request, 2_000) as Record<string, unknown>;
    orderIdValue = String(body.orderId || "");
  } else {
    const form = await request.text();
    orderIdValue = new URLSearchParams(form).get("orderId") || "";
  }
  if (!ORDER_ID.test(orderIdValue)) throw new PaidError("order_unavailable", 404);
  const order = await services.repository.getById(orderIdValue);
  if (!order?.checkoutSessionId) throw new PaidError("order_unavailable", 404);
  const payload = {
    id: `evt_mock_${order.id.slice(4)}`,
    type: "checkout.session.completed",
    livemode: false,
    data: { object: {
      id: order.checkoutSessionId,
      client_reference_id: order.id,
      payment_status: "paid",
      amount_total: order.baseAmountMinor,
      currency: "gbp",
      payment_intent: `pi_mock_${order.id.slice(4)}`,
      metadata: { order_id: order.id },
    } },
  };
  const raw = JSON.stringify(payload);
  const timestamp = Math.floor(services.now() / 1000);
  const signature = await hmacSha256Hex(config.webhookSecret, `${timestamp}.${raw}`);
  await verifyStripeSignature(raw, `t=${timestamp},v1=${signature}`, config.webhookSecret, services.now());
  await applyStripeEvent({ event: parseStripeEvent(raw), stripeMode: "mock", repository: services.repository, kv: services.kv, email: services.email, now: services.now(), replyTo: services.replyTo || SUPPORT_EMAIL });
  if (contentType.includes("application/json")) return json({ ok: true, orderId: order.id });
  return Response.redirect(new URL(`/checkout/return?order=${order.id}`, request.url), 303);
}

const ATTEMPT_ID = /^[A-Za-z0-9_-]{16,80}$/;

function tokenMatches(expected: string, provided: string): boolean {
  const left = new TextEncoder().encode(expected);
  const right = new TextEncoder().encode(provided);
  if (left.length === 0 || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

async function handleBegin(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  await ready(services);
  const body = await readJson(request, 4_000) as Record<string, unknown>;
  if (typeof body.playerId !== "string" || !PLAYER_ID.test(body.playerId)) throw new PaidError("player_invalid", 400);
  if (typeof body.attemptId !== "string" || !ATTEMPT_ID.test(body.attemptId)) throw new PaidError("attempt_invalid", 400);
  if (!isEdition(body.edition)) throw new PaidError("edition_invalid", 400);
  const result = await services.repository.beginAttempt({ playerId: body.playerId, attemptId: body.attemptId, edition: body.edition, at: services.now() });
  if (!result.granted) {
    await services.repository.recordStat("paywall_view", "short", services.now());
    return json({ error: "cowries_required", ...result.wallet, gameCost: GAME_COST_COWRIES }, 402);
  }
  if (!result.resumed) await services.repository.recordStat("game_start", result.attempt.mode, services.now());
  return json({ attemptId: result.attempt.attemptId, edition: result.attempt.edition, mode: result.attempt.mode, resumed: result.resumed, ...result.wallet, gameCost: GAME_COST_COWRIES });
}

async function handleFinish(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  await ready(services);
  const body = await readJson(request, 4_000) as Record<string, unknown>;
  if (typeof body.playerId !== "string" || !PLAYER_ID.test(body.playerId)) throw new PaidError("player_invalid", 400);
  if (typeof body.attemptId !== "string" || !ATTEMPT_ID.test(body.attemptId)) throw new PaidError("attempt_invalid", 400);
  const result = await services.repository.finishAttempt({ playerId: body.playerId, attemptId: body.attemptId, at: services.now() });
  if (!result.already) await services.repository.recordStat("game_complete", "", services.now());
  if (result.showPaywall) await services.repository.recordStat("paywall_view", "after_free", services.now());
  const referral = await claimReferralIfFirstGame(services, body.playerId, result.wallet.completedGames, result.already);
  return json(referral ? { ...result, referral } : result);
}

async function handleOwnerStats(request: Request, services: PaidServices): Promise<Response> {
  const token = services.ownerStatsToken || "";
  const provided = request.headers.get("x-owner-stats-token") || "";
  if (!token) throw new PaidError("owner_stats_unconfigured", 503);
  if (!tokenMatches(token, provided)) throw new PaidError("owner_stats_rejected", 401);
  await ready(services);
  const since = new Date(services.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  return json({ days: await services.repository.listStats(since) });
}

function challengePreview(request: Request, services: PaidServices): { edition: string; score: number; ref: string | null } | null {
  if (!services.shareCards) return null;
  const url = new URL(request.url);
  const edition = url.searchParams.get("edition") || "";
  const score = Number(url.searchParams.get("score"));
  if (!isEdition(edition) || !Number.isInteger(score) || score < 0 || score > 12) return null;
  const ref = url.searchParams.get("ref");
  return { edition, score, ref: isReferralCode(ref) ? ref : null };
}

function withChallengePreview(html: string, preview: { edition: string; score: number; ref: string | null }): string {
  const image = shareCardImageUrl(preview.edition, preview.score);
  const page = challengeUrl(preview.edition, preview.score, preview.ref);
  return applyChallengeMeta(html, {
    title: "What’s Your Bride Price?",
    description: shareBlurb(preview.score),
    image,
    url: page,
  });
}

async function gameShell(request: Request, services: PaidServices): Promise<Response | null> {
  if (!services.assets) return null;
  const asset = await services.assets.fetch(new Request(new URL("/index.html", request.url), { headers: request.headers }));
  if (!asset.ok) return null;
  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(asset.body, { status: 200, headers });
}

async function serveBankChunk(request: Request, services: PaidServices): Promise<Response> {
  if (!services.assets) return json({ error: "not_found" }, 404);
  const asset = await services.assets.fetch(request);
  if (!asset.ok) return json({ error: "not_found" }, 404);
  const headers = new Headers(asset.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "public, max-age=3600");
  return new Response(asset.body, { status: 200, headers });
}

export async function servePaid(request: Request, services: PaidServices): Promise<Response> {
  const url = new URL(request.url);
  try {
    const revealFile = url.pathname.match(/^\/api\/paid\/royal-reveal\/([a-f0-9]{64})\/(card\.png|story\.png|decree\.pdf|bundle\.zip)$/);
    if (request.method === "GET" && revealFile) {
      return await handleRoyalFile(revealFile[1] || "", revealFile[2] || "", services);
    }
    if (request.method === "POST" && url.pathname === "/api/paid/royal-reveal") {
      sameOrigin(request);
      await ready(services);
      return await handleRoyalClaim(await readJson(request, 4_000) as Record<string, unknown>, services);
    }
    if (request.method === "GET" && url.pathname === "/api/paid/decree-preview.png") {
      return await handleDecreePreview(url, services);
    }
    if (request.method === "GET" && (url.pathname === "/api/paid/share-card.svg" || url.pathname === "/api/paid/share-card.png")) {
      return await handleShareCard(url, services, url.pathname.endsWith(".png") ? "png" : "svg");
    }
    if (request.method === "GET" && isQuestionBankChunk(url.pathname)) {
      return await serveBankChunk(request, services);
    }
    if (request.method === "GET" && !url.pathname.startsWith("/api/") && STATIC_ASSET.test(url.pathname)) {
      if (!services.assets) return json({ error: "not_found" }, 404);
      return services.assets.fetch(request);
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      await ready(services);
      try { await services.repository.recordStat("visit", "", services.now()); } catch { /* a stats miss must not hide the game */ }
      const shell = await gameShell(request, services);
      const preview = challengePreview(request, services);
      if (shell && !preview) return shell;
      const page = shell ? await shell.text() : playPageHtml();
      return html(preview ? withChallengePreview(page, preview) : page);
    }
    if (request.method === "GET" && (url.pathname === "/privacy" || url.pathname === "/terms" || url.pathname === "/refunds")) {
      return html(legalPage(url.pathname.slice(1) as "privacy" | "terms" | "refunds", services.royalRevealEnabled === true));
    }
    if (request.method === "GET" && url.pathname === "/api/paid/health") {
      return json({
        ok: true,
        stripeMode: services.config?.stripeMode ?? "unconfigured",
        canonical: CANONICAL_ORIGIN,
        hotPath: "kv",
        earnPaths: services.earnPaths === true,
        shareCards: services.shareCards === true,
        dailyChallenge: services.dailyChallenge === true,
        royalReveal: services.royalRevealEnabled === true,
        resultVideo: services.resultVideo === true,
        boosters: services.boosters === true,
      });
    }
    if (request.method === "GET" && url.pathname === "/api/paid/catalog") {
      return json({
        editions: editions(),
        products: productKeys.filter((key) => products[key].forSale && (products[key].kind !== "royal_reveal" || services.royalRevealEnabled)).map((key) => ({
          key,
          name: products[key].name,
          displayPrice: products[key].displayPrice,
          kind: products[key].kind,
          games: products[key].kind === "cowries" ? gamesInBundle(products[key].quantity) : 0,
        })),
        countries: priorityCountries.map(([code, name, currency]) => ({ code, name, currency })),
        waiverCountries: [...withdrawalCountries],
        waiverText: WAIVER_TEXT,
        waiverVersion: WAIVER_VERSION,
        royalWaiverText: ROYAL_WAIVER_TEXT,
        royalWaiverVersion: ROYAL_WAIVER_VERSION,
        canonical: CANONICAL_ORIGIN,
        paystack: { enabled: false, markets: paystackSeam.markets },
        blockedCountries: [...(services.blockedCountries ?? blockedPurchaseCountries(undefined))].sort(),
        purchasesBlocked: requestCountry(request) !== null && (services.blockedCountries ?? blockedPurchaseCountries(undefined)).has(requestCountry(request) as string),
        visitorCountry: requestCountry(request),
        purchaseBlockedMessage: PURCHASES_UNAVAILABLE_MESSAGE,
        earnPaths: services.earnPaths === true,
        shareCards: services.shareCards === true,
        dailyChallenge: services.dailyChallenge === true,
        royalReveal: services.royalRevealEnabled === true,
        resultVideo: services.resultVideo === true,
        boosters: services.boosters === true,
      });
    }
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/paid/result-video.mp4") {
      if (request.method === "POST") sameOrigin(request);
      return await handleResultVideoFile(request, url, services);
    }
    if (request.method === "GET" && url.pathname === "/api/paid/result-video") {
      return await handleResultVideoStory(url, services);
    }
    if (request.method === "GET" && url.pathname === "/api/paid/questions") {
      return await handleQuestionGet(url, services);
    }
    if (request.method === "POST" && url.pathname === "/api/paid/games/complete") {
      sameOrigin(request);
      return await handleQuestionComplete(request, services, await readJson(request, 20_000));
    }
    if (request.method === "GET" && url.pathname === "/api/paid/access") {
      await ready(services);
      const player = url.searchParams.get("player") || "";
      if (!PLAYER_ID.test(player)) throw new PaidError("player_invalid", 400);
      const wallet = await services.repository.wallet(player, services.now());
      return json({
        ...wallet,
        source: "d1",
        gameCost: GAME_COST_COWRIES,
        freeGamesAllowance: FREE_COMPLETED_GAMES,
        welcomeBonusCowries: WELCOME_BONUS_COWRIES,
        welcomeBonusDays: WELCOME_BONUS_MS / 86_400_000,
      });
    }
    if (request.method === "POST" && url.pathname === "/api/paid/cowries/spend") {
      sameOrigin(request);
      await ready(services);
      const body = await readJson(request, 2_000) as Record<string, unknown>;
      if (typeof body.playerId !== "string" || !PLAYER_ID.test(body.playerId)) throw new PaidError("player_invalid", 400);
      const count = body.count === undefined ? 1 : body.count;
      if (typeof count !== "number") throw new PaidError("spend_invalid", 400);
      assertSpendCount(count);
      const spent = await services.repository.spendCowries(body.playerId, count, services.now());
      if (!spent) return json({ error: "insufficient_cowries" }, 409);
      try {
        await projectAccess(services.kv, services.repository, body.playerId);
      } catch {
        // The cache is optional. The next access read uses D1.
      }
      return json({ cowries: spent.cowries, royal: spent.royal, source: "d1" });
    }
    if (request.method === "POST" && url.pathname === "/api/paid/games/begin") return await handleBegin(request, services);
    if (request.method === "POST" && url.pathname === "/api/paid/games/finish") return await handleFinish(request, services);
    if (request.method === "GET" && url.pathname === "/api/paid/boosters") return await handleBoosterStatus(url, services);
    if (request.method === "GET" && url.pathname === "/api/paid/boosters/offer") return await handleBoosterOffer(url, services);
    if (request.method === "POST" && url.pathname === "/api/paid/boosters/use") return await handleBoosterUse(request, services);
    if (request.method === "POST" && url.pathname === "/api/paid/boosters/freeze") return await handleBoosterFreeze(request, services);
    if (request.method === "POST" && url.pathname === "/api/paid/boosters/frame") return await handleBoosterFrame(request, services);
    if (request.method === "GET" && url.pathname === "/api/paid/daily") return await handleDailyStatus(url, services);
    if (request.method === "POST" && url.pathname === "/api/paid/daily/begin") return await handleDailyBegin(request, services);
    if (request.method === "POST" && url.pathname === "/api/paid/daily/finish") return await handleDailyFinish(request, services);
    if (request.method === "GET" && url.pathname === "/api/paid/daily/board") return await handleDailyBoard(url, services);
    if (request.method === "GET" && url.pathname === "/api/paid/nickname") return await handleNicknameRead(url, services);
    if (request.method === "POST" && url.pathname === "/api/paid/daily/nickname") return await handleDailyNickname(request, services);
    if (request.method === "POST" && url.pathname === "/api/paid/earn/perfect") return await handlePerfect(request, services);
    if (request.method === "POST" && url.pathname === "/api/paid/earn/share") return await handleShareReward(request, services);
    if (request.method === "GET" && url.pathname === "/api/paid/referral") return await handleReferralGet(url, services);
    if (request.method === "POST" && url.pathname === "/api/paid/referral/arrive") return await handleReferralArrive(request, services);
    if (request.method === "GET" && url.pathname === "/api/paid/owner/stats") return await handleOwnerStats(request, services);
    if (request.method === "POST" && url.pathname === "/api/paid/checkout") return await handleCheckout(request, services);
    if (request.method === "POST" && url.pathname === "/api/paid/webhook") return await handleWebhook(request, services);
    if (request.method === "POST" && url.pathname === "/api/paid/mock-pay") return await handleMockPay(request, services);
    if (request.method === "GET" && url.pathname === "/checkout/mock") {
      if (requireConfig(services).stripeMode !== "mock") throw new PaidError("mock_checkout_disabled", 404);
      const id = url.searchParams.get("order") || "";
      if (!ORDER_ID.test(id)) throw new PaidError("order_unavailable", 404);
      return html(mockCheckoutHtml(id));
    }
    if (request.method === "GET" && url.pathname === "/checkout/return") {
      const shell = await gameShell(request, services);
      if (shell) return shell;
      await ready(services);
      const id = url.searchParams.get("order") || "";
      if (!ORDER_ID.test(id)) throw new PaidError("order_unavailable", 404);
      const order = await services.repository.getById(id);
      if (!order) throw new PaidError("order_unavailable", 404);
      const entitlement = await services.repository.entitlementForOrder(id);
      const summary = entitlement?.state === "active"
        ? "Payment received. Your extra is unlocked on this browser profile."
        : `Order ${order.state}. If you closed checkout, you can try again from the game.`;
      return html(returnHtml(summary));
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/paid/orders/")) {
      await ready(services);
      const id = url.pathname.slice("/api/paid/orders/".length);
      if (!ORDER_ID.test(id)) throw new PaidError("order_unavailable", 404);
      const order = await services.repository.getById(id);
      if (!order) throw new PaidError("order_unavailable", 404);
      return json(publicOrder(order, await services.repository.entitlementForOrder(id)));
    }
    return json({ error: "not_found" }, 404);
  } catch (error) {
    if (isPaidError(error)) {
      const message = error.code === "purchases_unavailable_in_country"
        ? PURCHASES_UNAVAILABLE_MESSAGE
        : error.code === "name_invalid" || error.code === "name_rejected"
          ? DISPLAY_NAME_MESSAGE
          : null;
      return json(message ? { error: error.code, message } : { error: error.code }, error.status);
    }
    const message = error instanceof Error ? error.message.slice(0, 300) : "unknown";
    console.error(JSON.stringify({ level: "error", event: "paid_unhandled", message }));
    return json({ error: "unavailable" }, 500);
  }
}
