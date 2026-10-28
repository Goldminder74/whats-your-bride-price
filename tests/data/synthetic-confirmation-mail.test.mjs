import test from 'node:test';import assert from 'node:assert/strict';
import {setup} from '../helpers/cowrieCommerce.mjs';import {syntheticConfirmationMail,syntheticConfirmationPayload} from '../../worker/syntheticConfirmationMail.mjs';import {PURCHASE_TERMS,PURCHASE_TERMS_VERSION,COWRIE_PURCHASE_CONSENT} from '../../app/purchaseTerms.ts';
const payload={recipient:'ayo.m.ayeni@gmail.com',contract:{version:1,publicOrderReference:'rr_'+'a'.repeat(32),productKey:'cowrie_40_v1',originalCurrency:'GBP',originalAmountMinor:999,payment:{version:1,integrationCurrency:'GBP',integrationAmountMinor:999,presentmentCurrency:'EUR',presentmentAmountMinor:1234},seller:{version:1,legalName:'Ayodele Ayeni',tradingName:'Classes for Culture',geographicalAddress:'Synthetic seller address only',complaintsAddress:null,telephone:null,supportEmail:'team@classesforculture.com',privacyEmail:'team@classesforculture.com'},terms:PURCHASE_TERMS,termsVersion:PURCHASE_TERMS_VERSION,consent:{adultPurchase:true,text:COWRIE_PURCHASE_CONSENT,acceptedAt:Date.now()}}};
test('the replacement synthetic mail pins Google contact and terms without permitting mixed or arbitrary content',async()=>{
 const {purchaseTermsForContact}=await import('../../app/purchaseTerms.ts'),policy=purchaseTermsForContact('google-workspace');
 const input={...payload,contract:{...payload.contract,seller:{...payload.contract.seller,supportEmail:'support@mail.classesforculture.com',privacyEmail:'support@mail.classesforculture.com'},terms:policy.terms,termsVersion:policy.version}};
 assert.doesNotMatch(syntheticConfirmationPayload(input,'google-workspace').body,/team@classesforculture\.com/);
 assert.throws(()=>syntheticConfirmationPayload(payload,'google-workspace'));assert.throws(()=>syntheticConfirmationPayload(input,'legacy'));
 assert.throws(()=>syntheticConfirmationPayload({...input,contract:{...input.contract,terms:input.contract.terms+'arbitrary'}},'google-workspace'));
});
test('mail-only capability is OFF by default and rejects arbitrary recipients, addresses and terms before SMTP',async()=>{
 let connects=0;const connect=()=>{connects++;throw Error('must not connect');};await assert.rejects(syntheticConfirmationMail({},connect)(payload));assert.equal(connects,0);
 for(const p of [{...payload,recipient:'external@example.invalid'},{...payload,recipient:'noreply@classesforculture.com'},{...payload,contract:{...payload.contract,termsVersion:'arbitrary text'}},{...payload,contract:{...payload.contract,consent:{...payload.contract.consent,adultPurchase:false}}},{...payload,contract:{...payload.contract,seller:{...payload.contract.seller,geographicalAddress:'a real customer address'}}},{...payload,contract:{...payload.contract,terms:'arbitrary content'}}])assert.throws(()=>syntheticConfirmationPayload(p));
 assert.equal(syntheticConfirmationPayload(payload).to,'ayo.m.ayeni@gmail.com');assert.match(syntheticConfirmationPayload(payload).body,/Customer payment: EUR 12.34/);assert.match(syntheticConfirmationPayload(payload).body,/No real purchase or charge/);
});
test('one durable synthetic claim precedes SMTP; failed/unknown sends cannot repeat or mutate financial records',async()=>{
 const c=await setup(),before=c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n;let connects=0;
 try{
  const send=syntheticConfirmationMail({DB:c.adapter,WYBP_SYNTHETIC_CONFIRMATION_MAIL_ENABLED:'true',WYBP_AUTHORITY_ROLE:'production-ops',WYBP_AUTHORITY_DATABASE_NAME:'wybp-prod-d1-r001',WYBP_ALERT_SENDER:'noreply@classesforculture.com',WYBP_SMTP_USERNAME:'noreply@classesforculture.com',WYBP_SMTP_PASSWORD:'synthetic-only'},()=>{connects++;assert.equal(c.database.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='synthetic-hosted-confirmation-mail-v1'").get().state,'importing');throw Error('synthetic disconnected');});
  await assert.rejects(send(payload),/alert_transport_unavailable/);await assert.rejects(send(payload),/synthetic_confirmation_mail_unavailable/);assert.equal(connects,1);assert.equal(c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,before);
 }finally{c.database.close();}
});
test('concurrent synthetic requests produce one accepted SMTP transaction, retain the claim and do not imply receipt',async()=>{
 const c=await setup();let connects=0,controller;const commands=[],before=c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n;
 const connect=(address,options)=>{connects++;assert.deepEqual(address,{hostname:'mail.privateemail.com',port:465});assert.equal(options.secureTransport,'on');return {opened:Promise.resolve(),readable:new ReadableStream({start(v){controller=v;v.enqueue(new TextEncoder().encode('220 ready\r\n'));}}),writable:new WritableStream({write(bytes){const s=new TextDecoder().decode(bytes);commands.push(s);const reply=s.startsWith('EHLO')?'250 ready':s.startsWith('AUTH')?'235 accepted':s==='DATA\r\n'?'354 ready':'250 accepted';controller.enqueue(new TextEncoder().encode(reply+'\r\n'));}}),async close(){}};};
 try{
  const send=syntheticConfirmationMail({DB:c.adapter,WYBP_SYNTHETIC_CONFIRMATION_MAIL_ENABLED:'true',WYBP_AUTHORITY_ROLE:'production-ops',WYBP_AUTHORITY_DATABASE_NAME:'wybp-prod-d1-r001',WYBP_ALERT_SENDER:'noreply@classesforculture.com',WYBP_SMTP_USERNAME:'noreply@classesforculture.com',WYBP_SMTP_PASSWORD:'synthetic-only'},connect);
  const results=await Promise.allSettled([send(payload),send(payload)]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.deepEqual(results.find(v=>v.status==='fulfilled').value,{accepted:true,receiptVerified:false});assert.equal(connects,1);
  assert.ok(commands.includes('RCPT TO:<ayo.m.ayeni@gmail.com>\r\n'));const data=commands.find(v=>v.startsWith('From:'));assert.match(data,/Subject: \[TEST - synthetic data\] WYBP hosted purchase confirmation/);assert.equal(data.includes('synthetic-only'),false);
  assert.equal(c.database.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='synthetic-hosted-confirmation-mail-v1'").get().state,'complete');await assert.rejects(send(payload),/synthetic_confirmation_mail_unavailable/);assert.equal(connects,1);assert.equal(c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,before);
 }finally{c.database.close();}
});
