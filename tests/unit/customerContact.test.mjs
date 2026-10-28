import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolveCustomerContact,customerContact} from '../../app/customerContact.ts';
import {purchaseTermsForContact,PURCHASE_TERMS} from '../../app/purchaseTerms.ts';
import {parseSellerDetails} from '../../app/sellerDetails.ts';

test('contact profiles preserve the private game and keep commercial wording except the selected contact',()=>{
 assert.equal(customerContact.email,'team@classesforculture.com');
 const legacy=purchaseTermsForContact('legacy'),google=purchaseTermsForContact('google-workspace');
 assert.equal(legacy.terms,PURCHASE_TERMS);assert.notEqual(google.version,legacy.version);
 for(const field of ['terms','cowrieCancellation','royalCancellation']){assert.equal(google[field].replaceAll('support@mail.classesforculture.com','team@classesforculture.com'),legacy[field]);assert.doesNotMatch(google[field],/team@classesforculture\.com/);}
 assert.ok(Object.isFrozen(resolveCustomerContact('google-workspace')));
 for(const profile of ['',null,'arbitrary','support@other.invalid'])assert.throws(()=>resolveCustomerContact(profile),/customer_contact_profile_unavailable/);
});
test('seller contact parser permits only the named alternative and still rejects other domains and injection',()=>{
 const seller={version:1,legalName:'Ayodele Ayeni',tradingName:'Classes for Culture',geographicalAddress:'Synthetic test address only',complaintsAddress:null,telephone:null,supportEmail:'support@mail.classesforculture.com',privacyEmail:'support@mail.classesforculture.com'};
 assert.deepEqual(parseSellerDetails(JSON.stringify(seller)),seller);
 for(const change of [{supportEmail:'other@mail.classesforculture.com'},{privacyEmail:'other@mail.classesforculture.com'},{supportEmail:'support@mail.classesforculture.com.evil.invalid'},{privacyEmail:'support@mail.classesforculture.com\r\nBcc:other'}])assert.equal(parseSellerDetails(JSON.stringify({...seller,...change})),null);
});
test('Google build consistently pins new terms, privacy contacts and seller snapshot before preparing an order',()=>{
 const script=`
  import assert from 'node:assert/strict';
  globalThis.__WYBP_CUSTOMER_CONTACT_PROFILE__='google-workspace';
  const {legalInformation}=await import('./app/legalConfig.ts');
  const {customerEmailProviderDescription}=await import('./app/customerContact.ts');
  assert.match(customerEmailProviderDescription,/Google Workspace/);assert.doesNotMatch(customerEmailProviderDescription,/Namecheap.*purchase/);
  const {retentionSchedule}=await import('./app/retentionSchedule.ts');
  const {productionPurchasePolicy,PURCHASE_TERMS_VERSION}=await import('./app/purchaseConfirmationPolicy.ts');
  const seller={version:1,legalName:'Ayodele Ayeni',tradingName:'Classes for Culture',geographicalAddress:'Synthetic test address only',complaintsAddress:null,telephone:null,supportEmail:'support@mail.classesforculture.com',privacyEmail:'support@mail.classesforculture.com'};
  let prepared;const noop=async()=>{};const authority=Object.fromEntries(['recordPurchasePayment','cancelPurchaseConfirmation','preparePurchaseConfirmation','checkPendingPurchaseConfirmation','purchaseConfirmation','deliverPurchaseConfirmation'].map(k=>[k,noop]));authority.preparePurchaseConfirmation=async value=>{prepared=value;return {};};
  assert.equal(legalInformation.privacyContact,seller.privacyEmail);assert.equal(legalInformation.approvedForProduction,false);
  assert.doesNotMatch(JSON.stringify(retentionSchedule),/team@classesforculture\\.com/);
  for(const key of ['supportEmail','privacyEmail'])assert.throws(()=>productionPurchasePolicy({...seller,[key]:'team@classesforculture.com'},authority,['GB']));
  const policy=productionPurchasePolicy(seller,authority,['GB']);
  await policy.prepare({orderId:'synthetic',publicOrderReference:'rr_'+'a'.repeat(32),productKey:'cowrie_40_v1',amountMinor:999,currency:'GBP',createdAt:1,consentAt:1,details:{email:'synthetic@example.invalid',residenceCountry:'GB',termsVersion:PURCHASE_TERMS_VERSION,adultPurchase:true}});
  assert.match(prepared.terms,/support@mail.classesforculture.com/);assert.doesNotMatch(prepared.terms,/team@classesforculture\\.com/);assert.equal(prepared.seller.supportEmail,seller.supportEmail);assert.equal(prepared.termsVersion,'classes-for-culture-purchases-2026-10-28-google-mail');
 `;
 const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
