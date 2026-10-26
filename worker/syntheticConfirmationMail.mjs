import {privateEmailTransport} from './authorityMail.mjs';import {purchaseConfirmationText} from './purchaseConfirmationMail.mjs';
import {PURCHASE_TERMS,COWRIE_PURCHASE_CONSENT,ROYAL_PURCHASE_CONSENT} from '../app/purchaseTerms.ts';
const fail=()=>{throw Error('synthetic_confirmation_mail_unavailable');};
export function syntheticConfirmationPayload(input){
 const c=input?.contract,s=c?.seller;
 if(input?.recipient!=='noreply@classesforculture.com'||!s||s.legalName!=='Ayodele Ayeni'||s.tradingName!=='Classes for Culture'||s.geographicalAddress!=='Synthetic seller address only'||s.complaintsAddress!==null||s.telephone!==null||s.supportEmail!=='team@classesforculture.com'||s.privacyEmail!=='team@classesforculture.com'||c.terms!==PURCHASE_TERMS||c.consent?.text!==(c.productKey==='royal_reveal_v1'?ROYAL_PURCHASE_CONSENT:COWRIE_PURCHASE_CONSENT)||c.originalAmountMinor!==({cowrie_5_v1:199,cowrie_15_v1:499,cowrie_40_v1:999,royal_reveal_v1:199})[c.productKey])fail();
 return {to:'noreply@classesforculture.com',subject:'[TEST - synthetic data] WYBP hosted purchase confirmation',body:purchaseConfirmationText(c)};
}
export function syntheticConfirmationMail(env,connect){
 return async input=>{
  if(env.WYBP_SYNTHETIC_CONFIRMATION_MAIL_ENABLED!=='true'||env.WYBP_AUTHORITY_ROLE!=='production-ops'||env.WYBP_AUTHORITY_DATABASE_NAME!=='wybp-prod-d1-r001')fail();
  const mail=syntheticConfirmationPayload(input),at=Date.now(),id='synthetic-hosted-confirmation-mail-v1',hash='0'.repeat(64);
  // Exactly one durable claim, before SMTP. No customer/financial write, no
  // recipient or contract stored here, and no automatic retry after ambiguity.
  const claim=await env.DB.prepare("INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'custody',?2,0,?2,0,'importing',1,?3,?4) ON CONFLICT(id) DO NOTHING RETURNING id").bind(id,hash,at,at+30*86400000).all();
  if(claim.success!==true||claim.results?.length!==1)fail();
  const result=await privateEmailTransport(env,connect)(mail);
  const completed=await env.DB.prepare("UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id=?1 AND state='importing'").bind(id).run();if(completed.success!==true||completed.meta?.changes!==1)fail();return result;
 };
}
