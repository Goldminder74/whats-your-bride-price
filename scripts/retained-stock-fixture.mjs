// Offline synthetic data only. Does not contact a provider or create authority
// acknowledgements. Existing protected financial cases remain unchanged.
import {createHash} from 'node:crypto';
import {CowrieWalletService} from '../db/cowrieWallet.ts';
import {CommerceService,InMemoryCommerceRateLimiter} from '../db/commerce.ts';
import {productionPurchasePolicy,PURCHASE_TERMS_VERSION} from '../app/purchaseConfirmationPolicy.ts';
import {confirmationDraft,PurchaseConfirmations} from '../db/purchaseConfirmations.mjs';
import {COWRIE_DELIVERY_NOTICE_VERSION} from '../db/cowrieProducts.ts';
import {config,checkout,verified} from '../tests/helpers/cowrieCommerce.mjs';
const DAY=86400000,hash=s=>createHash('sha256').update(s).digest('hex');
export function populateRetainedStock(database,{completed=495000,incomplete=21500,wallets=550000,at=Date.now(),checkpoint=()=>{}}={}){
 if(!database?.prepare||!Number.isSafeInteger(at)||at<1000000000000||!Number.isSafeInteger(completed)||completed<99||completed>495000||!Number.isSafeInteger(incomplete)||incomplete<0||incomplete>21500||!Number.isSafeInteger(wallets)||wallets<completed+incomplete||wallets>550000||typeof checkpoint!=='function')throw Error('retained_stock_scope');
 if(database.prepare("SELECT id FROM quiz_attempts WHERE id='retained_attempt_0'").get())throw Error('retained_stock_already_started');
 const template=t=>database.prepare('SELECT * FROM '+t+' LIMIT 1').get(),attempt=template('quiz_attempts'),result=template('results'),wallet=template('cowrie_wallets'),answers=database.prepare('SELECT * FROM answers WHERE attempt_id=? ORDER BY id').all(attempt?.id);
 if(!attempt||!result||!wallet||answers.length!==12)throw Error('retained_stock_template');
 // One local transaction owns the fixture. Failure rolls back; a committed
 // prefix is never appended a second time. No schema or migration is introduced.
 const insert=(table,row)=>{const keys=Object.keys(row),p=database.prepare('INSERT INTO '+table+'('+keys.map(k=>'"'+k+'"').join(',')+') VALUES('+keys.map(()=>'?').join(',')+')');return v=>p.run(...keys.map(k=>v[k]));};
 const addWallet=insert('cowrie_wallets',wallet),addAttempt=insert('quiz_attempts',attempt),addResult=insert('results',result),addAnswer=insert('answers',answers[0]);
 const key=(kind,i)=>hash('retained-offline-fixture:'+kind+':'+i),before=Object.fromEntries(['quiz_attempts','results','answers','cowrie_wallets'].map(t=>[t,database.prepare('SELECT COUNT(*) n FROM '+t).get().n]));
 // The original protected example is counted separately, not silently copied
 // into active gameplay or used as a second purchased balance.
 database.exec('BEGIN');try{
  for(let i=0;i<wallets;i++){
   const playing=i<completed+incomplete,done=i<completed,clock=at-(done?i%99:playing?i%10:i%30)*DAY-3600000,owner=key('owner',i),id='wallet_'+key('wallet-id',i).slice(0,32),attemptId='retained_attempt_'+i;
   addWallet({...wallet,id,public_reference:'cw_'+key('wallet',i).slice(0,32),anonymous_owner_hash:owner,state:'active',purchased_balance:0,bonus_balance:0,free_quick_plays_consumed:playing?1:0,last_access_idempotency_hash:playing?key('access',i):null,recovery_credential_hash:key('recovery',i),recovery_credential_version:1,closed_at:null,ownership_minimized_at:null,retention_expires_at:null,deleted_at:null,frozen_at:null,created_at:clock,updated_at:clock,version:1});
   if(playing){
    addAttempt({...attempt,id:attemptId,anonymous_subject_hash:owner,status:done?'completed':'in_progress',idempotency_key_hash:key('idempotency',i),selection_seed_reference:key('seed',i),started_at:clock,completed_at:done?clock+600000:null,expires_at:clock+(done?90:1)*DAY+(done?600000:0),created_at:clock,updated_at:clock+(done?600000:0),deleted_at:null,anonymized_at:null,cowrie_issued_at:null,version:1});
    if(done){addResult({...result,id:'retained_result_'+i,attempt_id:attemptId,public_slug:key('slug',i).slice(0,48),state:'active',expires_at:clock+600000+90*DAY,created_at:clock+600000,updated_at:clock+600000,deleted_at:null,anonymized_at:null,revoked_at:null,version:1});
     for(const [j,a]of answers.entries())addAnswer({...a,id:'retained_answer_'+i+'_'+j,attempt_id:attemptId,answered_at:clock+30000*(j+1),created_at:clock+30000*(j+1),updated_at:clock+30000*(j+1)});
    }
   }
   if(i%1000===0)checkpoint({wallets:i,completed:Math.min(i,completed),at});
  }
  if(database.prepare('PRAGMA foreign_key_check').all().length)throw Error('retained_stock_foreign_keys');database.exec('COMMIT');
 }catch(e){database.exec('ROLLBACK');throw e;}
 return {synthetic:true,measuredCompletions:0,completed,incomplete,wallets,physicalAnswers:completed*12,retentionDays:99,before,qualification:'Physical historical fixture, including expired rows for purge-grace/outage recovery. Protected original paid/closed/held/deleted examples are additional; not six years of paid-order stock.'};
}

// Historical synthetic volume through the actual order/contract/webhook code.
// Fixture mail acceptance is local only; it is NEVER hosted-delivery evidence.
export async function populateRetainedPurchases(context,{count=15000,at=Date.now(),key,checkpoint=()=>{}}={}){
 if(!context?.adapter||!context?.walletRepository||!Buffer.isBuffer(key)||key.length!==32||!Number.isInteger(count)||count<1||count>15000||!Number.isSafeInteger(at)||typeof checkpoint!=='function')throw Error('retained_purchase_scope');
 const db=context.database,prior=db.prepare("SELECT id FROM cowrie_wallets WHERE last_access_idempotency_hash=?").get(hash('retained-purchase-stock-marker'));if(prior)throw Error('retained_purchase_already_started');
 const before=db.prepare('SELECT COUNT(*) n FROM purchase_confirmations').get().n,seller={version:1,legalName:'Ayodele Ayeni',tradingName:'Classes for Culture',geographicalAddress:'Synthetic retained fixture address only',complaintsAddress:null,telephone:null,supportEmail:'team@classesforculture.com',privacyEmail:'team@classesforculture.com'};let clock=at,fixtureAcceptances=0;
 const store=new PurchaseConfirmations(context.adapter,key),authority={preparePurchaseConfirmation:async v=>confirmationDraft(v,key),checkPendingPurchaseConfirmation:(...v)=>store.pendingMatches(...v),recordPurchasePayment:(id,owner,proof)=>store.recordPayment(id,owner,proof,clock),cancelPurchaseConfirmation:id=>store.cancelForOrder(id,clock),purchaseConfirmation:(...v)=>store.owned(...v),deliverPurchaseConfirmation:async id=>{await store.ready(id,clock);return store.deliver(id,async()=>{fixtureAcceptances++;return {accepted:true};},()=>clock);}},policy=productionPurchasePolicy(seller,authority,['GB']),service=new CommerceService(context.repository,new InMemoryCommerceRateLimiter(),config,()=>clock,{cowriePurchasesEnabled:true,confirmations:policy}),wallets=new CowrieWalletService(context.walletRepository,{now:()=>clock});
 for(let i=0;i<count;i++){
  clock=at;const credential=hash('retained-purchase-credential:'+i).slice(0,32),wallet=await wallets.createOrGet({anonymousSessionCredential:credential}),order=await service.startOrder({productKey:'cowrie_5_v1',walletReference:wallet.wallet.walletReference,anonymousSessionCredential:credential,idempotencyKey:hash('retained-purchase-order:'+i).slice(0,32),immediateDeliveryConsent:true,consentNoticeVersion:COWRIE_DELIVERY_NOTICE_VERSION,confirmation:{email:'synthetic@example.invalid',residenceCountry:'GB',termsVersion:PURCHASE_TERMS_VERSION,adultPurchase:true}});
  await service.webhook(await verified('checkout.session.completed',checkout(order,'cowrie_5_v1','pi_retained_stock_'+i)));if(i===0)db.prepare('UPDATE cowrie_wallets SET last_access_idempotency_hash=? WHERE public_reference=?').run(hash('retained-purchase-stock-marker'),wallet.wallet.walletReference);if(i%100===0)checkpoint({orders:i+1,at});
 }
 const mismatch=db.prepare("SELECT COUNT(*) n FROM cowrie_wallets w WHERE purchased_balance!=COALESCE((SELECT SUM(delta) FROM cowrie_ledger WHERE wallet_id=w.id AND bucket='purchased'),0)").get().n;
 if(mismatch||db.prepare('PRAGMA foreign_key_check').all().length||db.prepare('SELECT COUNT(*) n FROM purchase_confirmations').get().n-before!==count)throw Error('retained_purchase_relationships');
 return {synthetic:true,historicalOrders:count,encryptedConfirmations:count,fixtureAcceptances,externalEmails:0,measuredPurchases:0,qualification:'Actual application contracts and signed fixture webhooks at the fixture cut, without backdating publication or purchase authority. Local fake SMTP accepts only synthetic payloads; not real purchases, financial authority acknowledgements, six years of order volume or hosted mail evidence. Protected original refund/hold/closed/deleted cases remain additional.'};
}
