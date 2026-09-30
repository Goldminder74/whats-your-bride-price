import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  COMMERCE_MAX_BODY_BYTES,
  ROYAL_REVEAL_CONSENT_NOTICE_VERSION,
  ROYAL_REVEAL_PRODUCT_KEY,
  constructPaymentLinkUrl,
  deriveCommerceOwnerHash,
  validateCommerceConfiguration,
  validateStartOrderRequest,
  verifyStripeWebhook,
} from "../../db/commerceContracts.ts";
import {
  CommerceService,
  InMemoryCommerceRateLimiter,
  InMemoryCommerceRepository,
  UnavailableCommerceRateLimiter,
  createReviewCommerceConfig,
} from "../../db/commerce.ts";
import { createRoyalRevealProjection, requireRoyalRevealProjection } from "../../app/royalRevealProjection.ts";
import { ROYAL_CERTIFICATE_HEIGHT,ROYAL_CERTIFICATE_WIDTH,ROYAL_PORTRAIT_HEIGHT,ROYAL_PORTRAIT_STYLES,ROYAL_PORTRAIT_WIDTH,royalCertificateFilename,royalPortraitFilename,royalStoryProjection } from "../../app/royalRevealMedia.ts";
import { regions } from "../../app/gameData.ts";
import { ResultCompletionService, validateResultCompletionRequest } from "../../db/resultCompletion.ts";

const now = Date.UTC(2026, 7, 26, 12);
const rawCredential = "01".repeat(16);
const resultSlug = "d".repeat(48);
const config = createReviewCommerceConfig();

async function fixture() {
  const repository = new InMemoryCommerceRepository(); const ownerHash = await deriveCommerceOwnerHash(rawCredential);
  repository.results.set(resultSlug, Object.freeze({ id:"result-1",publicSlug:resultSlug,edition:"west",score:10,total:12,resultTitle:"Bride Price Royalty",avatarId:"adjoa",state:"active",expiresAt:now+86_400_000,attemptStatus:"completed",attemptCompletedAt:now-1_000,attemptExpiresAt:now+86_400_000,anonymousOwnerHash:ownerHash }));
  const service = new CommerceService(repository,new InMemoryCommerceRateLimiter(),config,()=>now);
  return { repository, service, ownerHash };
}

function request(overrides={}) { return { productKey:ROYAL_REVEAL_PRODUCT_KEY,resultSlug,anonymousSessionCredential:rawCredential,idempotencyKey:"a".repeat(32),immediateDeliveryConsent:true,consentNoticeVersion:ROYAL_REVEAL_CONSENT_NOTICE_VERSION,...overrides }; }
function stripeRaw(type, object, id=`evt_${"a".repeat(24)}`) { return JSON.stringify({ id,type,livemode:false,data:{object} }); }
function signed(raw, timestamp=Math.floor(now/1000), extras=[]) { const valid=createHmac("sha256",config.webhookSigningSecret).update(`${timestamp}.${raw}`).digest("hex"); return [`t=${timestamp}`,...extras.map((value)=>`v1=${value}`),`v1=${valid}`].join(","); }

function completionRequest(overrides={}) {
  return {
    anonymousSessionCredential:rawCredential,idempotencyKey:"result-completion-key-1",avatarId:"adjoa",
    answers:regions.west.questions.map((question,index)=>({questionStableId:`west_q${String(index+1).padStart(2,"0")}`,selectedOptionIds:question.correct.map((option)=>`o${option+1}`)})),
    ...overrides,
  };
}

function resultAuthority(edition="west") {
  return {editionId:`edition_${edition}_v1`,edition,questions:regions[edition].questions.map((question,index)=>({
    id:`question_${edition}_${index+1}`,stableId:`${edition}_q${String(index+1).padStart(2,"0")}`,version:1,
    optionIds:question.options.map((_,option)=>`o${option+1}`),correctOptionIds:question.correct.map((option)=>`o${option+1}`),scoringWeight:1,
  }))};
}

class CompletionRepository {
  storageAvailable=true; records=[]; idempotency=new Map();
  async getByIdempotencyHash(hash){return this.idempotency.get(hash)||null;}
  async getAuthority(stableIds){return resultAuthority(stableIds[0].split("_",1)[0]);}
  async completeAtomically(record){this.records.push(record);this.idempotency.set(record.idempotencyHash,{publicSlug:record.resultPublicSlug,edition:record.edition,anonymousOwnerHash:record.anonymousOwnerHash});return "created";}
}

test("durable result completion rejects browser result claims and recomputes from authoritative answers", async () => {
  assert.equal(validateResultCompletionRequest(completionRequest()).answers.length,12);
  assert.throws(()=>validateResultCompletionRequest({...completionRequest(),edition:"west"}),/field_not_allowed/);
  assert.throws(()=>validateResultCompletionRequest({...completionRequest(),score:12}),/field_not_allowed/);
  assert.throws(()=>validateResultCompletionRequest({...completionRequest(),resultSlug:"d".repeat(48)}),/field_not_allowed/);
  assert.throws(()=>validateResultCompletionRequest(completionRequest({anonymousSessionCredential:"a".repeat(64)})),/owner_invalid/);
  const repository=new CompletionRepository();const service=new ResultCompletionService(repository,{now:()=>now,randomSource:(bytes)=>{bytes.fill(7);return bytes;}});
  const first=await service.complete(completionRequest());const replay=await service.complete(completionRequest());
  assert.equal(first.resultSlug,"07".repeat(24));assert.equal(replay.resultSlug,first.resultSlug);assert.equal(repository.records.length,1);
  const record=repository.records[0];assert.equal(record.score,12);assert.equal(record.total,12);assert.equal(record.tier,3);assert.equal(record.answers.length,12);
  assert.equal(record.anonymousOwnerHash,await deriveCommerceOwnerHash(rawCredential));assert.doesNotMatch(JSON.stringify(record),new RegExp(rawCredential));
});

test("durable result ownership is credential-specific and browser answer identifiers cannot override scoring", async () => {
  const repository=new CompletionRepository();let fill=10;const service=new ResultCompletionService(repository,{now:()=>now,randomSource:(bytes)=>{bytes.fill(fill++);return bytes;}});
  const wrongAnswers=completionRequest({answers:completionRequest().answers.map((answer)=>({...answer,selectedOptionIds:["o1"]}))});
  await service.complete(wrongAnswers);const record=repository.records[0];
  const expected=regions.west.questions.reduce((score,question)=>score+(question.correct.length===1&&question.correct[0]===0?1:0),0);
  assert.equal(record.score,expected);assert.notEqual(record.score,12);
  await service.complete(completionRequest({anonymousSessionCredential:"02".repeat(16),idempotencyKey:"result-completion-key-2"}));
  assert.equal(repository.records.length,2);assert.notEqual(repository.records[0].anonymousOwnerHash,repository.records[1].anonymousOwnerHash);
});

test("commerce configuration and Payment Link construction are exact and private-field free", () => {
  assert.equal(validateCommerceConfiguration(config).expectedAmountMinor,199);
  assert.throws(()=>validateCommerceConfiguration({...config,webhookSigningSecret:""}),/secret|configuration/i);
  assert.throws(()=>validateCommerceConfiguration({...config,publicPaymentLinkUrl:"http://buy.stripe.com/test"}),/payment_link/i);
  assert.throws(()=>validateCommerceConfiguration({...config,publicPaymentLinkUrl:"https://evil.example/test"}),/payment_link/i);
  const reference=`rr_${"1".repeat(32)}`; const url=new URL(constructPaymentLinkUrl(config.publicPaymentLinkUrl,reference));
  assert.equal(url.searchParams.get("client_reference_id"),reference); assert.equal([...url.searchParams].length,1);
  assert.doesNotMatch(url.toString(),/(credential|subject|result|challenge|email|name|answer|secret)/i);
});

test("start-order request requires completed-result fields and unchecked consent cannot pass", () => {
  assert.equal(validateStartOrderRequest(request()).productKey,ROYAL_REVEAL_PRODUCT_KEY);
  assert.throws(()=>validateStartOrderRequest(request({immediateDeliveryConsent:false})),/consent/i);
  assert.throws(()=>validateStartOrderRequest(request({productKey:"other"})),/product/i);
  assert.throws(()=>validateStartOrderRequest({...request(),amount:199}),/field/i);
  assert.equal(COMMERCE_MAX_BODY_BYTES,16_384);
});

test("order creation verifies ownership, exact price configuration, idempotency and fail-closed rate limiting", async () => {
  const {repository,service,ownerHash}=await fixture(); const first=await service.startOrder(request()); const second=await service.startOrder(request());
  assert.equal(first.publicOrderReference,second.publicOrderReference); assert.equal(first.displayPrice,"£1.99"); assert.equal(repository.orders.size,1);
  await assert.rejects(()=>service.startOrder(request({anonymousSessionCredential:"02".repeat(16),idempotencyKey:"b".repeat(32)})),/result_unavailable/);
  await assert.rejects(()=>service.startOrder(request({anonymousSessionCredential:ownerHash,idempotencyKey:"c".repeat(32)})),/result_unavailable/);
  const unavailable=new CommerceService(repository,new UnavailableCommerceRateLimiter(),config,()=>now);
  await assert.rejects(()=>unavailable.startOrder(request({idempotencyKey:"d".repeat(32)})),/rate_limit_unavailable/);
});

test("Stripe signatures require raw body, five-minute tolerance and permit multiple v1 signatures", async () => {
  const raw=stripeRaw("checkout.session.completed",{id:"cs_test_paid",client_reference_id:`rr_${"1".repeat(32)}`,payment_status:"paid",payment_link:config.expectedPaymentLinkId,payment_intent:"pi_paid",amount_total:199,currency:"gbp",mode:"payment"});
  assert.equal((await verifyStripeWebhook({rawBody:raw,signatureHeader:signed(raw,Math.floor(now/1000),["0".repeat(64)]),config,now})).paymentStatus,"paid");
  await assert.rejects(()=>verifyStripeWebhook({rawBody:`${raw} `,signatureHeader:signed(raw),config,now}),/signature/);
  await assert.rejects(()=>verifyStripeWebhook({rawBody:raw,signatureHeader:signed(raw,Math.floor(now/1000)-301),config,now}),/expired/);
  await assert.rejects(()=>verifyStripeWebhook({rawBody:"x".repeat(65_537),signatureHeader:signed(raw),config,now}),/signature/);
});

test("webhook validation rejects livemode, Payment Link, price, currency and unknown references", async () => {
  const object={id:"cs_test_bad",client_reference_id:`rr_${"1".repeat(32)}`,payment_status:"paid",payment_link:config.expectedPaymentLinkId,payment_intent:"pi_bad",amount_total:199,currency:"gbp",mode:"payment"};
  for (const mutation of [{payment_link:"plink_wrong"},{amount_total:200},{currency:"usd"},{client_reference_id:"bad"},{mode:"subscription"}]) {
    const raw=stripeRaw("checkout.session.completed",{...object,...mutation}); await assert.rejects(()=>verifyStripeWebhook({rawBody:raw,signatureHeader:signed(raw),config,now}),/mismatch/);
  }
  const live=JSON.stringify({id:`evt_${"b".repeat(24)}`,type:"checkout.session.completed",livemode:true,data:{object}}); await assert.rejects(()=>verifyStripeWebhook({rawBody:live,signatureHeader:signed(live),config,now}),/event/);
});

test("paid, delayed, async-failure and replay handling are authoritative and idempotent", async () => {
  const {repository,service}=await fixture(); const pending=await service.startOrder(request());
  const base={id:"cs_test_paid",client_reference_id:pending.publicOrderReference,payment_link:config.expectedPaymentLinkId,payment_intent:"pi_paid",amount_total:199,currency:"gbp",mode:"payment"};
  const processingRaw=stripeRaw("checkout.session.completed",{...base,payment_status:"unpaid"},`evt_${"c".repeat(24)}`); const processing=await verifyStripeWebhook({rawBody:processingRaw,signatureHeader:signed(processingRaw),config,now}); await service.webhook(processing);
  assert.equal((await service.orderStatus({publicOrderReference:pending.publicOrderReference,anonymousSessionCredential:rawCredential})).state,"processing");
  const paidRaw=stripeRaw("checkout.session.async_payment_succeeded",{...base,payment_status:"paid"},`evt_${"d".repeat(24)}`); const paid=await verifyStripeWebhook({rawBody:paidRaw,signatureHeader:signed(paidRaw),config,now});
  assert.equal((await service.webhook(paid)).replay,false); assert.equal((await service.webhook(paid)).replay,true); assert.equal(repository.entitlements.size,1);
  assert.equal((await service.entitlement({resultSlug,anonymousSessionCredential:rawCredential})).active,true);
});

test("asynchronous failure, reordered success and concurrent fulfilment preserve one authoritative entitlement", async () => {
  const {repository,service}=await fixture(); const pending=await service.startOrder(request());
  const base={id:"cs_test_ordered",client_reference_id:pending.publicOrderReference,payment_link:config.expectedPaymentLinkId,payment_intent:"pi_ordered",amount_total:199,currency:"gbp",mode:"payment"};
  const failedRaw=stripeRaw("checkout.session.async_payment_failed",{...base,payment_status:"unpaid"},`evt_${"2".repeat(24)}`);await service.webhook(await verifyStripeWebhook({rawBody:failedRaw,signatureHeader:signed(failedRaw),config,now}));
  assert.equal((await service.orderStatus({publicOrderReference:pending.publicOrderReference,anonymousSessionCredential:rawCredential})).state,"failed");assert.equal(repository.entitlements.size,0);
  const successEvents=await Promise.all(["3","4"].map(async(char)=>{const raw=stripeRaw("checkout.session.async_payment_succeeded",{...base,payment_status:"paid"},`evt_${char.repeat(24)}`);return verifyStripeWebhook({rawBody:raw,signatureHeader:signed(raw),config,now});}));
  await Promise.all(successEvents.map((event)=>service.webhook(event)));assert.equal(repository.entitlements.size,1);assert.equal((await service.orderStatus({publicOrderReference:pending.publicOrderReference,anonymousSessionCredential:rawCredential})).state,"fulfilled");
  const lateFailureRaw=stripeRaw("checkout.session.async_payment_failed",{...base,payment_status:"unpaid"},`evt_${"5".repeat(24)}`);await service.webhook(await verifyStripeWebhook({rawBody:lateFailureRaw,signatureHeader:signed(lateFailureRaw),config,now}));
  assert.equal((await service.orderStatus({publicOrderReference:pending.publicOrderReference,anonymousSessionCredential:rawCredential})).state,"fulfilled");assert.equal(repository.entitlements.size,1);
});

test("full refunds and disputes revoke; partial refunds require review without automatic revocation", async () => {
  const {repository,service}=await fixture(); const pending=await service.startOrder(request());
  const paidObject={id:"cs_test_paid",client_reference_id:pending.publicOrderReference,payment_status:"paid",payment_link:config.expectedPaymentLinkId,payment_intent:"pi_paid",amount_total:199,currency:"gbp",mode:"payment"};
  const paidRaw=stripeRaw("checkout.session.completed",paidObject,`evt_${"e".repeat(24)}`); await service.webhook(await verifyStripeWebhook({rawBody:paidRaw,signatureHeader:signed(paidRaw),config,now}));
  const partialRaw=stripeRaw("charge.refunded",{id:"ch_partial",payment_intent:"pi_paid",amount:199,amount_refunded:100,currency:"gbp"},`evt_${"f".repeat(24)}`); await service.webhook(await verifyStripeWebhook({rawBody:partialRaw,signatureHeader:signed(partialRaw),config,now})); assert.equal(repository.entitlements.size,1);
  const fullRaw=stripeRaw("charge.refunded",{id:"ch_full",payment_intent:"pi_paid",amount:199,amount_refunded:199,currency:"gbp"},`evt_${"1".repeat(24)}`); await service.webhook(await verifyStripeWebhook({rawBody:fullRaw,signatureHeader:signed(fullRaw),config,now})); assert.equal(repository.entitlements.size,0);
  const disputed=await fixture();const disputedPending=await disputed.service.startOrder(request());const disputedPaid={id:"cs_test_disputed",client_reference_id:disputedPending.publicOrderReference,payment_status:"paid",payment_link:config.expectedPaymentLinkId,payment_intent:"pi_disputed",amount_total:199,currency:"gbp",mode:"payment"};const disputedPaidRaw=stripeRaw("checkout.session.completed",disputedPaid,`evt_${"6".repeat(24)}`);await disputed.service.webhook(await verifyStripeWebhook({rawBody:disputedPaidRaw,signatureHeader:signed(disputedPaidRaw),config,now}));
  const disputeRaw=stripeRaw("charge.dispute.created",{id:"dp_test",payment_intent:"pi_disputed",amount:199,currency:"gbp"},`evt_${"7".repeat(24)}`);await disputed.service.webhook(await verifyStripeWebhook({rawBody:disputeRaw,signatureHeader:signed(disputeRaw),config,now}));assert.equal(disputed.repository.entitlements.size,0);assert.equal((await disputed.service.orderStatus({publicOrderReference:disputedPending.publicOrderReference,anonymousSessionCredential:rawCredential})).state,"disputed");
});

test("success-page and query-shaped values cannot grant entitlement", async () => {
  const {service}=await fixture(); await assert.rejects(()=>service.entitlement({resultSlug,anonymousSessionCredential:rawCredential,success:"true",session_id:"cs_fake"}),/request|unavailable/);
});

test("premium media requires a verified result-specific entitlement and exposes exact dimensions", async () => {
  const plain={active:true,productKey:"royal_reveal_v1",resultSlug,edition:"west",score:10,maximumScore:12,resultTitle:"Bride Price Royalty",avatarId:"adjoa"};
  assert.throws(()=>requireRoyalRevealProjection(plain),/entitlement/); const projection=createRoyalRevealProjection(plain); assert.ok(projection); assert.equal(requireRoyalRevealProjection(projection),projection);
  assert.equal(createRoyalRevealProjection({...plain,resultSlug:"e".repeat(48),privatePhoto:"blob:secret",resultTitle:"Invented"}),null);
  assert.deepEqual(ROYAL_PORTRAIT_STYLES,["royal_gold","cowrie_crown","indigo_celebration"]);assert.equal(ROYAL_PORTRAIT_WIDTH,1080);assert.equal(ROYAL_PORTRAIT_HEIGHT,1350);assert.equal(ROYAL_CERTIFICATE_WIDTH,2480);assert.equal(ROYAL_CERTIFICATE_HEIGHT,3508);
  for(const style of ROYAL_PORTRAIT_STYLES)assert.match(royalPortraitFilename(style,"west"),/\.png$/);assert.match(royalCertificateFilename("west"),/\.png$/);assert.equal(royalStoryProjection(projection).publicResultUrl,null);
  const [media,story,pack]=await Promise.all([readFile(new URL("../../app/royalRevealMedia.ts",import.meta.url),"utf8"),readFile(new URL("../../app/storyVideo.ts",import.meta.url),"utf8"),readFile(new URL("../../app/RoyalRevealPack.tsx",import.meta.url),"utf8")]);
  assert.match(story,/activeFeatureFlags\.commerce[^]*requireRoyalRevealProjection/);assert.match(media,/requireRoyalRevealProjection/);assert.doesNotMatch(`${media}\n${pack}`,/privatePhoto|portraitUrl|orderReference|stripe|credential|challengeCode/i);
});
