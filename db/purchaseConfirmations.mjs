// Server-only immutable contracts. All writes use the supplied atomic/journalled
// repository; this service never fulfils a purchase or contacts Stripe.
import {randomUUID} from 'node:crypto';
import {encryptRecord,decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
import {COWRIE_DELIVERY_NOTICE_VERSION} from './cowrieProducts.ts';
import {ROYAL_REVEAL_CONSENT_NOTICE_VERSION} from './commerceContracts.ts';
import {parseSellerDetails} from '../app/sellerDetails.ts';
import {stripeMoney} from './stripeMoney.mjs';
const fail=()=>{throw Error('purchase_confirmation_unavailable');};
const hash=value=>recoveryHash(Buffer.from(JSON.stringify(value)));
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
const email=value=>typeof value==='string'&&value.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value);
const currency=value=>typeof value==='string'&&/^[A-Z]{3}$/.test(value)&&Intl.supportedValuesOf('currency').includes(value);
const moneyCore=p=>({checkoutSessionId:p.checkoutSessionId,integrationCurrency:p.integrationCurrency,integrationAmountMinor:p.integrationAmountMinor,presentmentCurrency:p.presentmentCurrency,presentmentAmountMinor:p.presentmentAmountMinor});
export {COWRIE_CANCELLATION_DRAFT} from '../app/purchaseTerms.ts';
export function confirmationDraft(input,key){
 if(!Buffer.isBuffer(key)||key.length!==32||!identifier(input?.orderId)||!/^rr_[0-9a-f]{32}$/.test(input.publicOrderReference||'')||!email(input.email)||!parseSellerDetails(JSON.stringify(input.seller))||!['cowrie_5_v1','cowrie_15_v1','cowrie_40_v1','royal_reveal_v1'].includes(input.productKey)||input.currency!=='GBP'||input.adultPurchase!==true||input.consentNoticeVersion!==(input.productKey==='royal_reveal_v1'?ROYAL_REVEAL_CONSENT_NOTICE_VERSION:COWRIE_DELIVERY_NOTICE_VERSION)||!Number.isSafeInteger(input.amountMinor)||input.amountMinor!==({cowrie_5_v1:199,cowrie_15_v1:499,cowrie_40_v1:999,royal_reveal_v1:199})[input.productKey]||!Number.isSafeInteger(input.createdAt)||input.createdAt<1||input.consentAt!==input.createdAt||typeof input.termsVersion!=='string'||!input.termsVersion||typeof input.terms!=='string'||!input.terms||input.terms.length>12000||typeof input.consentText!=='string'||!input.consentText||input.consentText.length>2000||!/^[A-Z]{2}$/.test(input.residenceCountry||''))fail();
 const contract={version:1,publicOrderReference:input.publicOrderReference,productKey:input.productKey,originalCurrency:input.currency,originalAmountMinor:input.amountMinor,seller:input.seller,termsVersion:input.termsVersion,terms:input.terms,consent:{noticeVersion:input.consentNoticeVersion,text:input.consentText,acceptedAt:input.consentAt,adultPurchase:input.adultPurchase},residenceCountry:input.residenceCountry,createdAt:input.createdAt};
 const seal=(value,kind)=>encryptRecord(value,key,'purchase-confirmation:'+kind+':'+input.orderId).toString('base64');
 return {orderId:input.orderId,contractHash:hash(contract),encryptedContract:seal(contract,'contract'),encryptedRecipient:seal(input.email,'recipient'),createdAt:input.createdAt};
}
export function purchaseConfirmationInsert(database,draft){
 if(!identifier(draft?.orderId)||!/^[a-f0-9]{64}$/.test(draft.contractHash||''))fail();
 // Append to the SAME batch as the pending order insert. No historical backfill.
 return database.prepare("INSERT INTO purchase_confirmations(order_id,contract_hash,encrypted_contract,encrypted_recipient,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)").bind(draft.orderId,draft.contractHash,draft.encryptedContract,draft.encryptedRecipient,draft.createdAt);
}
export class PurchaseConfirmations {
 constructor(database,key){if(!database?.prepare||!Buffer.isBuffer(key)||key.length!==32)fail();this.database=database;this.key=key;}
 async row(orderId){if(!identifier(orderId))fail();return this.database.prepare('SELECT c.*,o.state order_state FROM purchase_confirmations c JOIN commerce_orders o ON o.id=c.order_id WHERE c.order_id=?1').bind(orderId).first();}
 open(row){try{const contract=decryptRecord(Buffer.from(row.encrypted_contract,'base64'),this.key,'purchase-confirmation:contract:'+row.order_id);if(hash(contract)!==row.contract_hash)fail();if(row.encrypted_payment){const payment=decryptRecord(Buffer.from(row.encrypted_payment,'base64'),this.key,'purchase-confirmation:payment:'+row.order_id);if(hash(payment)!==row.payment_hash)fail();return {...contract,payment};}return contract;}catch{fail();}}
 async owned(orderId,ownerHash){if(!/^[a-f0-9]{64}$/.test(ownerHash||'')||!identifier(orderId))fail();const row=await this.database.prepare('SELECT c.* FROM purchase_confirmations c JOIN commerce_orders o ON o.id=c.order_id WHERE c.order_id=?1 AND o.anonymous_owner_hash=?2 AND o.fulfilled_at IS NOT NULL').bind(orderId,ownerHash).first();if(!row?.encrypted_payment)fail();return this.open(row);}
 async recordPayment(orderId,ownerHash,proof,now){
  if(!identifier(orderId)||!/^[a-f0-9]{64}$/.test(ownerHash||'')||typeof proof?.rawBody!=='string'||Buffer.byteLength(proof.rawBody)>262144||!/^evt_[A-Za-z0-9_]{2,251}$/.test(proof.eventId||'')||!Number.isSafeInteger(now))fail();
  const row=await this.database.prepare("SELECT c.*,o.amount_minor,o.currency,o.stripe_checkout_session_id,o.stripe_payment_link_id,o.client_reference_id FROM purchase_confirmations c JOIN commerce_orders o ON o.id=c.order_id WHERE c.order_id=?1 AND o.anonymous_owner_hash=?2 AND o.state='fulfilled' AND o.fulfilled_at IS NOT NULL").bind(orderId,ownerHash).first();if(!row)fail();
  const event=await this.database.prepare('SELECT payload_sha256,order_id,processed_at FROM stripe_webhook_events WHERE stripe_event_id=?1').bind(proof.eventId).first();
  if(!event||event.order_id!==orderId||event.processed_at===null||event.payload_sha256!==recoveryHash(Buffer.from(proof.rawBody)))fail();
  let source;try{source=JSON.parse(proof.rawBody);}catch{fail();}const object=source?.data?.object;
  if(source.id!==proof.eventId||!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(source.type)||!object||object.payment_status!=='paid'||object.currency!=='gbp'||object.amount_total!==row.amount_minor||row.currency!=='GBP'||object.id!==row.stripe_checkout_session_id||object.payment_link!==row.stripe_payment_link_id||object.client_reference_id!==row.client_reference_id)fail();
  const details=object.presentment_details;
  if(details!==undefined&&details!==null&&(!details||Array.isArray(details)||typeof details!=='object'||typeof details.presentment_currency!=='string'||!currency(details.presentment_currency.toUpperCase())||!Number.isSafeInteger(details.presentment_amount)||details.presentment_amount<1||(details.presentment_currency.toUpperCase()==='GBP'&&details.presentment_amount!==row.amount_minor)))fail();
  const payment={version:1,checkoutSessionId:object.id,integrationCurrency:'GBP',integrationAmountMinor:row.amount_minor,presentmentCurrency:details?.presentment_currency.toUpperCase()||'GBP',presentmentAmountMinor:details?.presentment_amount??row.amount_minor,stripeEventId:source.id,payloadSha256:event.payload_sha256};
  if(row.encrypted_payment){if(hash(moneyCore(this.open(row).payment))!==hash(moneyCore(payment)))fail();return {recorded:true,replay:true};}
  stripeMoney(payment.presentmentCurrency,payment.presentmentAmountMinor);
  const encrypted=encryptRecord(payment,this.key,'purchase-confirmation:payment:'+orderId).toString('base64');
  const result=await this.database.prepare("UPDATE purchase_confirmations SET payment_hash=?2,encrypted_payment=?3,payment_recorded_at=?4,state='ready',updated_at=?4,version=version+1 WHERE order_id=?1 AND state='awaiting_payment' AND encrypted_payment IS NULL AND version=?5").bind(orderId,hash(payment),encrypted,now,row.version).run();
  if(result.success!==true)fail();if(result.meta?.changes!==1){const current=await this.row(orderId);if(!current?.encrypted_payment||hash(moneyCore(this.open(current).payment))!==hash(moneyCore(payment)))fail();}
  return {recorded:true,replay:result.meta?.changes!==1};
 }
 async pendingMatches(orderId,ownerHash,details){if(!identifier(orderId)||!/^[a-f0-9]{64}$/.test(ownerHash||''))fail();const row=await this.database.prepare("SELECT c.* FROM purchase_confirmations c JOIN commerce_orders o ON o.id=c.order_id WHERE c.order_id=?1 AND o.anonymous_owner_hash=?2 AND o.state='pending'").bind(orderId,ownerHash).first();if(!row)return false;const contract=this.open(row);try{const recipient=decryptRecord(Buffer.from(row.encrypted_recipient,'base64'),this.key,'purchase-confirmation:recipient:'+orderId);return details?.adultPurchase===true&&details.termsVersion===contract.termsVersion&&details.residenceCountry===contract.residenceCountry&&details.email===recipient;}catch{fail();}}
 async cancelForOrder(orderId,now){const row=await this.row(orderId);if(!row||!['failed','expired','refunded','disputed','deleted'].includes(row.order_state))fail();if(!['awaiting_payment','ready','uncertain'].includes(row.state))return {state:row.state};await this.database.prepare("UPDATE purchase_confirmations SET state='cancelled',encrypted_recipient=NULL,updated_at=?2,version=version+1 WHERE order_id=?1 AND state IN ('awaiting_payment','ready','uncertain')").bind(orderId,now).run();return {state:'cancelled'};}
 async ready(orderId){const row=await this.row(orderId);if(!row||row.order_state!=='fulfilled'||!row.encrypted_payment||row.state==='awaiting_payment')fail();return row.state;}
 async deliver(orderId,send,now=Date.now){
  if(typeof send!=='function')fail();const row=await this.row(orderId);if(!row||row.order_state!=='fulfilled')fail();
  if(row.state!=='ready')return {state:row.state,sent:false};
  const contract=this.open(row);let recipient;try{recipient=decryptRecord(Buffer.from(row.encrypted_recipient,'base64'),this.key,'purchase-confirmation:recipient:'+orderId);}catch{fail();}if(!email(recipient))fail();
  const attempt=randomUUID().replaceAll('-',''),at=now();
  const result=await this.database.prepare("UPDATE purchase_confirmations SET state='sending',attempt_id=?2,attempted_at=?3,updated_at=?3,version=version+1 WHERE order_id=?1 AND state='ready' AND version=?4").bind(orderId,attempt,at,row.version).run();
  if(result.success!==true||result.meta?.changes!==1)return {state:'not_claimed',sent:false};
  // A restored/crashed 'sending' record never sends again automatically. The
  // pre-send claim MUST have a durable authority boundary before send is called.
  let accepted=false;try{const receipt=await send({recipient,contract,attempt});accepted=receipt?.accepted===true;}catch{/* Unknown SMTP outcomes are retained for review, never retried. */}
  const committed=await this.database.prepare("UPDATE purchase_confirmations SET state=?3,encrypted_recipient=CASE WHEN ?3='sent' THEN NULL ELSE encrypted_recipient END,delivered_at=CASE WHEN ?3='sent' THEN ?4 ELSE NULL END,updated_at=?4,version=version+1 WHERE order_id=?1 AND attempt_id=?2 AND state='sending'").bind(orderId,attempt,accepted?'sent':'uncertain',now()).run();
  recipient='';if(committed.success!==true||committed.meta?.changes!==1)fail();return {state:accepted?'sent':'uncertain',sent:accepted,meaning:'sent means SMTP acceptance, not verified inbox receipt'};
 }
}
