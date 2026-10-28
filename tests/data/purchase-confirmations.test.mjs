import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {setup,request,now,checkout,verified,balance} from '../helpers/cowrieCommerce.mjs';
import {stripeConfirmationProof} from '../../db/commerceContracts.ts';
import {REQUESTED_SALES_COUNTRIES,ROYAL_PURCHASE_CONSENT,ROYAL_CANCELLATION_POLICY} from '../../app/purchaseTerms.ts';
import {confirmationDraft,purchaseConfirmationInsert,PurchaseConfirmations} from '../../db/purchaseConfirmations.mjs';
const seller={version:1,legalName:'Ayodele Ayeni',tradingName:'Classes for Culture',geographicalAddress:'Synthetic test address only',complaintsAddress:null,telephone:null,supportEmail:'team@classesforculture.com',privacyEmail:'team@classesforculture.com'};
test('approved UK-only policy rejects foreign residence and old terms without inventing a cancellation waiver',()=>{
 assert.deepEqual(REQUESTED_SALES_COUNTRIES,['GB']);assert.match(ROYAL_PURCHASE_CONSENT,/does not waive/);assert.doesNotMatch(ROYAL_PURCHASE_CONSENT,/lose my/);assert.match(ROYAL_CANCELLATION_POLICY,/14 days/);assert.match(ROYAL_CANCELLATION_POLICY,/opened your Royal Reveal/);
 const noop=async()=>{},authority=Object.fromEntries(['recordPurchasePayment','cancelPurchaseConfirmation','preparePurchaseConfirmation','checkPendingPurchaseConfirmation','purchaseConfirmation','deliverPurchaseConfirmation'].map(k=>[k,noop]));
 assert.throws(()=>productionPurchasePolicy(seller,authority,['US']));const policy=productionPurchasePolicy(seller,authority,['GB']);
 const confirmation={email:'synthetic@example.invalid',residenceCountry:'GB',termsVersion:PURCHASE_TERMS_VERSION,adultPurchase:true};assert.equal(policy.parse({confirmation}).details.residenceCountry,'GB');
 for(const change of [{residenceCountry:'US'},{residenceCountry:'NG'},{adultPurchase:false},{termsVersion:'classes-for-culture-purchases-v1'}])assert.throws(()=>policy.parse({confirmation:{...confirmation,...change}}));
});
async function complete(c,object=checkout(c.order)){const event=await verified('checkout.session.completed',object);await c.service.webhook(event);await c.confirmations.recordPayment(c.row.id,c.row.anonymous_owner_hash,stripeConfirmationProof(event),now);return event;}
async function fixture(){const c=await setup(),order=await c.service.startOrder(request(c)),row=c.database.prepare('SELECT * FROM commerce_orders WHERE public_order_reference=?').get(order.publicOrderReference),key=randomBytes(32),input={orderId:row.id,publicOrderReference:order.publicOrderReference,productKey:'cowrie_5_v1',amountMinor:199,currency:'GBP',createdAt:now,consentAt:now,termsVersion:'synthetic-terms-v1',terms:'Synthetic contract terms; statutory rights preserved.',adultPurchase:true,consentNoticeVersion:row.consent_notice_version,consentText:'Synthetic immediate-access request; no cancellation waiver.',residenceCountry:'GB',email:'synthetic@example.invalid',seller};return {...c,order,row,key,input,confirmations:new PurchaseConfirmations(c.adapter,key)};}
test('confirmation migration is additive, snapshots encrypted and immutable, with no historical backfill',async()=>{const c=await fixture();try{
 assert.equal(c.database.prepare('SELECT COUNT(*) n FROM purchase_confirmations').get().n,0);
 const draft=confirmationDraft(c.input,c.key);await c.adapter.batch([purchaseConfirmationInsert(c.adapter,draft)]);
 const stored=c.database.prepare('SELECT * FROM purchase_confirmations').get();assert.equal(JSON.stringify(stored).includes(c.input.email),false);assert.equal(JSON.stringify(stored).includes(seller.geographicalAddress),false);
 await assert.rejects(c.confirmations.owned(c.row.id,c.row.anonymous_owner_hash));
 assert.throws(()=>c.database.prepare("UPDATE purchase_confirmations SET encrypted_contract='changed',state='ready',version=2").run(),/immutable/);
 assert.throws(()=>confirmationDraft({...c.input,currency:'USD'},c.key));
 assert.throws(()=>c.database.prepare("UPDATE purchase_confirmations SET state='sent',attempt_id='synthetic',attempted_at=?,updated_at=?,version=2").run(now,now));
 await complete(c);
 await assert.rejects(c.adapter.batch([purchaseConfirmationInsert(c.adapter,draft)]));assert.deepEqual(balance(c),{purchased_balance:5,bonus_balance:0});
 assert.equal((await c.confirmations.owned(c.row.id,c.row.anonymous_owner_hash)).terms,c.input.terms);
 }finally{c.database.close();}});
test('concurrent send claims submit once, minimise the recipient after SMTP acceptance and never change fulfilment',async()=>{const c=await fixture();try{
 await c.adapter.batch([purchaseConfirmationInsert(c.adapter,confirmationDraft(c.input,c.key))]);await complete(c);await c.confirmations.ready(c.row.id,now);
 let calls=0,release;const send=async value=>{calls++;assert.equal(value.recipient,c.input.email);await new Promise(r=>{release=r;});return {accepted:true};};
 const first=c.confirmations.deliver(c.row.id,send,()=>now);for(let i=0;i<20&&!release;i++)await Promise.resolve();
 const second=await c.confirmations.deliver(c.row.id,send,()=>now);assert.equal(second.sent,false);release();assert.equal((await first).state,'sent');assert.equal(calls,1);
 assert.equal(c.database.prepare('SELECT encrypted_recipient FROM purchase_confirmations').get().encrypted_recipient,null);assert.deepEqual(balance(c),{purchased_balance:5,bonus_balance:0});
 assert.equal((await c.confirmations.deliver(c.row.id,send,()=>now)).sent,false);assert.equal(calls,1);
 }finally{c.database.close();}});
test('uncertain SMTP acknowledgement remains reviewable, preserves ciphertext and is never automatically retried',async()=>{const c=await fixture();try{
 await c.adapter.batch([purchaseConfirmationInsert(c.adapter,confirmationDraft(c.input,c.key))]);await complete(c);await c.confirmations.ready(c.row.id,now);
 let calls=0;const send=async()=>{calls++;throw Error('synthetic lost SMTP acknowledgement');};assert.equal((await c.confirmations.deliver(c.row.id,send,()=>now)).state,'uncertain');assert.ok(c.database.prepare('SELECT encrypted_recipient FROM purchase_confirmations').get().encrypted_recipient);
 assert.equal((await c.confirmations.deliver(c.row.id,send,()=>now)).sent,false);assert.equal(calls,1);assert.deepEqual(balance(c),{purchased_balance:5,bonus_balance:0});
 }finally{c.database.close();}});
import {productionPurchasePolicy,PURCHASE_TERMS_VERSION} from '../../app/purchaseConfirmationPolicy.ts';
import {CommerceService,InMemoryCommerceRateLimiter} from '../../db/commerce.ts';
import {config,credential} from '../helpers/cowrieCommerce.mjs';
import {purchaseConfirmationText,purchaseConfirmationMail} from '../../worker/purchaseConfirmationMail.mjs';
import {stripeMoney} from '../../db/stripeMoney.mjs';

test('Google confirmation delivery retains the durable claim, accounting and uncertain-send suppression',async()=>{
 for(const lost of [false,true]){
  const c=await fixture();let connects=0,controller;
  const connect=(address,options)=>{connects++;assert.deepEqual(address,{hostname:'smtp-relay.gmail.com',port:465});assert.equal(options.secureTransport,'on');assert.equal(c.database.prepare('SELECT state FROM purchase_confirmations').get().state,'sending');return {opened:Promise.resolve(),readable:new ReadableStream({start(v){controller=v;v.enqueue(new TextEncoder().encode('220 ready\r\n'));}}),writable:new WritableStream({write(bytes){const text=new TextDecoder().decode(bytes);if(lost&&text.startsWith('From:')){controller.close();return;}controller.enqueue(new TextEncoder().encode((text.startsWith('EHLO')?'250 ready':text.startsWith('AUTH')?'235 accepted':text==='DATA\r\n'?'354 ready':'250 accepted')+'\r\n'));}}),async close(){}};};
  try{
   await c.adapter.batch([purchaseConfirmationInsert(c.adapter,confirmationDraft(c.input,c.key))]);await complete(c);await c.confirmations.ready(c.row.id,now);
   const send=purchaseConfirmationMail({WYBP_PURCHASE_MAIL_PROVIDER:'google-workspace-relay',WYBP_PURCHASE_MAIL_SENDER:'receipts@mail.classesforculture.com',WYBP_PURCHASE_MAIL_USERNAME:'backup-operator@classesforculture.com',WYBP_PURCHASE_MAIL_PASSWORD:'synthetic-only'},connect);
   assert.equal((await c.confirmations.deliver(c.row.id,send,()=>now)).state,lost?'uncertain':'sent');assert.equal((await c.confirmations.deliver(c.row.id,send,()=>now)).sent,false);assert.equal(connects,1);assert.deepEqual(balance(c),{purchased_balance:5,bonus_balance:0});assert.equal(c.database.prepare('PRAGMA foreign_key_check').all().length,0);
   assert.equal(c.database.prepare('SELECT encrypted_recipient FROM purchase_confirmations').get().encrypted_recipient===null,!lost);
  }finally{c.database.close();}
 }
});

test('converted confirmation pins exact verified presentment, rejects altered proof and never changes original GBP fulfilment',async()=>{
 const c=await fixture();try{
  await c.adapter.batch([purchaseConfirmationInsert(c.adapter,confirmationDraft(c.input,c.key))]);
  const object={...checkout(c.order),presentment_details:{presentment_currency:'eur',presentment_amount:245}};
  const event=await verified('checkout.session.completed',object);await c.service.webhook(event);
  await assert.rejects(c.confirmations.ready(c.row.id),/unavailable/);
  const proof=stripeConfirmationProof(event);await assert.rejects(c.confirmations.recordPayment(c.row.id,c.row.anonymous_owner_hash,{...proof,rawBody:proof.rawBody.replace('"eur"','"usd"')},now));
  await assert.rejects(c.confirmations.recordPayment(c.row.id,'f'.repeat(64),proof,now));
  await c.confirmations.recordPayment(c.row.id,c.row.anonymous_owner_hash,proof,now);
  const contract=await c.confirmations.owned(c.row.id,c.row.anonymous_owner_hash);assert.equal(contract.originalAmountMinor,199);assert.equal(contract.payment.presentmentAmountMinor,245);assert.equal(contract.payment.presentmentCurrency,'EUR');assert.match(purchaseConfirmationText(contract),/Customer payment: EUR 2.45/);
  const stored=c.database.prepare('SELECT * FROM purchase_confirmations').get();assert.equal(stored.encrypted_payment.includes('EUR'),false);
  assert.throws(()=>c.database.prepare("UPDATE purchase_confirmations SET payment_hash=?,state='sending',attempt_id='synthetic_tamper',attempted_at=?,version=version+1").run('0'.repeat(64),now),/immutable/);
  const duplicate=await verified('checkout.session.completed',object);await c.service.webhook(duplicate);assert.equal((await c.confirmations.recordPayment(c.row.id,c.row.anonymous_owner_hash,stripeConfirmationProof(duplicate),now)).replay,true);
  assert.equal(c.database.prepare('SELECT version FROM purchase_confirmations').get().version,stored.version);assert.deepEqual(balance(c),{purchased_balance:5,bonus_balance:0});
  const changed=await verified('checkout.session.completed',{...object,presentment_details:{presentment_currency:'usd',presentment_amount:300}});await c.service.webhook(changed);await assert.rejects(c.confirmations.recordPayment(c.row.id,c.row.anonymous_owner_hash,stripeConfirmationProof(changed),now));assert.equal((await c.confirmations.owned(c.row.id,c.row.anonymous_owner_hash)).payment.presentmentCurrency,'EUR');
 }finally{c.database.close();}
});
test('Stripe charge units display exactly, including zero-decimal and compatibility currencies',()=>{
 assert.equal(stripeMoney('JPY',245),'JPY 245');assert.equal(stripeMoney('MGA',245),'MGA 245');assert.equal(stripeMoney('ISK',500),'ISK 5.00');assert.equal(stripeMoney('UGX',500),'UGX 5.00');assert.equal(stripeMoney('HUF',1045),'HUF 10.45');assert.throws(()=>stripeMoney('ISK',501));assert.throws(()=>stripeMoney('ZZZ',245));
});
test('durable confirmation names all four products clearly and rejects unknown products',()=>{
 const base={version:1,publicOrderReference:'rr_'+'a'.repeat(32),originalCurrency:'GBP',originalAmountMinor:199,payment:{version:1,integrationCurrency:'GBP',integrationAmountMinor:199,presentmentCurrency:'GBP',presentmentAmountMinor:199},seller,terms:'Synthetic terms',termsVersion:'synthetic',consent:{text:'Synthetic request',acceptedAt:now}};
 for(const [productKey,label] of Object.entries({cowrie_5_v1:'5 Cowries',cowrie_15_v1:'15 Cowries',cowrie_40_v1:'40 Cowries',royal_reveal_v1:'Royal Reveal'})){
  const text=purchaseConfirmationText({...base,productKey});assert.ok(text.includes('Product: '+label));assert.equal(text.includes(productKey),false);
 }
 assert.throws(()=>purchaseConfirmationText({...base,productKey:'unknown'}),/purchase_confirmation_mail_unavailable/);
});
test('application-linked order and immutable contract commit together; retries and signed webhook replay never duplicate money or email',async()=>{
 const c=await setup(),key=randomBytes(32),store=new PurchaseConfirmations(c.adapter,key);let sends=0;
 const authority={recordPurchasePayment:(orderId,owner,proof)=>store.recordPayment(orderId,owner,proof,now),cancelPurchaseConfirmation:(orderId)=>store.cancelForOrder(orderId,now),preparePurchaseConfirmation:async input=>confirmationDraft(input,key),checkPendingPurchaseConfirmation:(...args)=>store.pendingMatches(...args),purchaseConfirmation:(...args)=>store.owned(...args),deliverPurchaseConfirmation:async(orderId)=>{await store.ready(orderId,now);return store.deliver(orderId,async()=>{sends++;return {accepted:true};},()=>now);}};
 const policy=productionPurchasePolicy(seller,authority,['GB']),service=new CommerceService(c.repository,new InMemoryCommerceRateLimiter(),config,()=>now,{cowriePurchasesEnabled:true,confirmations:policy});
 const input={...request(c),confirmation:{email:'synthetic@example.invalid',residenceCountry:'GB',termsVersion:PURCHASE_TERMS_VERSION,adultPurchase:true}};
 try{
  await assert.rejects(service.startOrder(request(c)));assert.equal(c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,0);
  c.adapter.failAt=1;await assert.rejects(service.startOrder(input));assert.equal(c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,0);assert.equal(c.database.prepare('SELECT COUNT(*) n FROM purchase_confirmations').get().n,0);c.adapter.failAt=-1;
  const order=await service.startOrder(input);assert.deepEqual(await service.startOrder(input),order);assert.equal(c.database.prepare('SELECT COUNT(*) n FROM purchase_confirmations').get().n,1);
  await assert.rejects(service.startOrder({...input,confirmation:{...input.confirmation,email:'different@example.invalid'}}));
  const event=await verified('checkout.session.completed',checkout(order));await service.webhook(event);await service.webhook(event);assert.equal(sends,1);assert.deepEqual(balance(c),{purchased_balance:5,bonus_balance:0});
  const contract=await service.purchaseConfirmation({publicOrderReference:order.publicOrderReference,anonymousSessionCredential:credential});assert.equal(contract.consent.adultPurchase,true);const text=purchaseConfirmationText(contract);assert.match(text,/GBP 1.99/);assert.match(text,/statutory rights/);assert.equal(text.includes(credential),false);assert.equal(text.includes(input.confirmation.email),false);
  await assert.rejects(service.purchaseConfirmation({publicOrderReference:order.publicOrderReference,anonymousSessionCredential:'f'.repeat(32)}));
 }finally{c.database.close();}
});

test('confirmation retention follows verified settlement, closure and legal holds without a new retention clock',async()=>{
 const {operatorRetentionPlan,runApprovedRetention}=await import('../../db/retention.ts');const {adverse}=await import('../helpers/cowrieCommerce.mjs');const c=await fixture();
 const apply=(action,at=now)=>c.adapter.batch(operatorRetentionPlan(action,at).map(p=>c.adapter.prepare(p.sql).bind(...p.params)));
 try{
  await c.adapter.batch([purchaseConfirmationInsert(c.adapter,confirmationDraft(c.input,c.key))]);await complete(c);await c.walletService.clear({anonymousSessionCredential:credential});await c.service.webhook(await verified('charge.refunded',adverse()));
  assert.equal((await c.confirmations.cancelForOrder(c.row.id,now)).state,'cancelled');assert.equal(c.database.prepare('SELECT encrypted_recipient FROM purchase_confirmations').get().encrypted_recipient,null);
  const event=c.database.prepare("SELECT id FROM stripe_webhook_events WHERE event_type='charge.refunded'").get();await apply({operation:'settlement',orderId:c.row.id,eventId:event.id,reason:'verified_refund'});await apply({operation:'close-wallet',walletId:c.row.cowrie_wallet_id,evidenceHash:'a'.repeat(64)});
  const future=c.database.prepare('SELECT financial_until FROM retention_closures').get().financial_until+86400000;
  await apply({operation:'hold',id:'synthetic_confirmation_hold',scope:'order',subjectId:c.row.id,reason:'legal',evidenceHash:'b'.repeat(64)},future);
  await runApprovedRetention(c.adapter,future,50);assert.equal(c.database.prepare('SELECT COUNT(*) n FROM purchase_confirmations').get().n,1);
  await apply({operation:'release-hold',id:'synthetic_confirmation_hold'},future+1);await runApprovedRetention(c.adapter,future+2,50);assert.equal(c.database.prepare('SELECT COUNT(*) n FROM purchase_confirmations').get().n,0);assert.equal(c.database.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{c.database.close();}
});
