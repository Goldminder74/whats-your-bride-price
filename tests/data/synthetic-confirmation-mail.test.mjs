import test from 'node:test';import assert from 'node:assert/strict';
import {setup} from '../helpers/cowrieCommerce.mjs';import {syntheticConfirmationMail,syntheticConfirmationPayload} from '../../worker/syntheticConfirmationMail.mjs';import {PURCHASE_TERMS,COWRIE_PURCHASE_CONSENT} from '../../app/purchaseTerms.ts';
const payload={recipient:'noreply@classesforculture.com',contract:{version:1,publicOrderReference:'rr_'+'a'.repeat(32),productKey:'cowrie_40_v1',originalCurrency:'GBP',originalAmountMinor:999,payment:{version:1,integrationCurrency:'GBP',integrationAmountMinor:999,presentmentCurrency:'EUR',presentmentAmountMinor:1234},seller:{version:1,legalName:'Ayodele Ayeni',tradingName:'Classes for Culture',geographicalAddress:'Synthetic seller address only',complaintsAddress:null,telephone:null,supportEmail:'team@classesforculture.com',privacyEmail:'team@classesforculture.com'},terms:PURCHASE_TERMS,termsVersion:'synthetic-test',consent:{text:COWRIE_PURCHASE_CONSENT,acceptedAt:Date.now()}}};
test('mail-only capability is OFF by default and rejects arbitrary recipients, addresses and terms before SMTP',async()=>{
 let connects=0;const connect=()=>{connects++;throw Error('must not connect');};await assert.rejects(syntheticConfirmationMail({},connect)(payload));assert.equal(connects,0);
 for(const p of [{...payload,recipient:'external@example.invalid'},{...payload,contract:{...payload.contract,seller:{...payload.contract.seller,geographicalAddress:'a real customer address'}}},{...payload,contract:{...payload.contract,terms:'arbitrary content'}}])assert.throws(()=>syntheticConfirmationPayload(p));
 assert.match(syntheticConfirmationPayload(payload).body,/Customer payment: EUR 12.34/);
});
test('one durable synthetic claim precedes SMTP; failed/unknown sends cannot repeat or mutate financial records',async()=>{
 const c=await setup(),before=c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n;let connects=0;
 try{
  const send=syntheticConfirmationMail({DB:c.adapter,WYBP_SYNTHETIC_CONFIRMATION_MAIL_ENABLED:'true',WYBP_AUTHORITY_ROLE:'production-ops',WYBP_AUTHORITY_DATABASE_NAME:'wybp-prod-d1-r001',WYBP_ALERT_SENDER:'noreply@classesforculture.com',WYBP_SMTP_USERNAME:'noreply@classesforculture.com',WYBP_SMTP_PASSWORD:'synthetic-only'},()=>{connects++;assert.equal(c.database.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='synthetic-hosted-confirmation-mail-v1'").get().state,'importing');throw Error('synthetic disconnected');});
  await assert.rejects(send(payload),/alert_transport_unavailable/);await assert.rejects(send(payload),/synthetic_confirmation_mail_unavailable/);assert.equal(connects,1);assert.equal(c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,before);
 }finally{c.database.close();}
});
