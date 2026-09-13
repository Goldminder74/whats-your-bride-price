import { createHmac } from "node:crypto";
import { applyMigrationPlan,createIsolatedDatabase,loadMigrationPlan } from "../../scripts/data-migrations.mjs";
import { buildDevelopmentSeed,developmentSeedStatements } from "../../db/seeds/development.ts";
import { CommerceService,D1CommerceRepository,InMemoryCommerceRateLimiter,createReviewCommerceConfig } from "../../db/commerce.ts";
import { CowrieWalletService,D1CowrieWalletRepository } from "../../db/cowrieWallet.ts";
import { D1QuestionSelectionRepository } from "../../db/questionSelection.ts";
import { cowrieProducts,cowrieProductKeys,COWRIE_DELIVERY_NOTICE_VERSION } from "../../db/cowrieProducts.ts";
import { verifyStripeWebhook } from "../../db/commerceContracts.ts";

export const now = Date.UTC(2026,8,12,12);
export const credential="a".repeat(32);
export const config = Object.freeze({...createReviewCommerceConfig(),cowrieBundles:Object.fromEntries(cowrieProductKeys.map(key=>[key,Object.freeze({publicPaymentLinkUrl:`https://buy.stripe.com/test_review_${key}`,expectedPaymentLinkId:`plink_review_${key}`,expectedProductKey:key,expectedQuantity:cowrieProducts[key].quantity,expectedAmountMinor:cowrieProducts[key].amountMinor,expectedCurrency:"GBP",expectedLivemode:false})]))});
export class Statement {
  constructor(database,sql,params=[]) {this.database=database;this.sql=sql;this.params=params;}
  bind(...params) {return new Statement(this.database,this.sql,params);}
  execute(){if(/^\s*(SELECT|WITH)\b/i.test(this.sql))return{success:true,results:this.database.prepare(this.sql).all(...this.params).map(row=>({...row})),meta:{changes:0}};const result=this.database.prepare(this.sql).run(...this.params);return{success:true,results:[],meta:{changes:Number(result.changes)}};}
  async run(){return this.execute();}
  async all(){return{success:true,results:this.database.prepare(this.sql).all(...this.params).map(row=>({...row})),meta:{}};}
  async first(column){const row=this.database.prepare(this.sql).get(...this.params);return row?column?row[column]:{...row}:null;}
}
export class Adapter {
  constructor(database){this.database=database;this.beforeBatch=null;this.failAt=-1;}
  prepare(sql){return new Statement(this.database,sql);}
  async batch(statements){if(this.beforeBatch){const hook=this.beforeBatch;this.beforeBatch=null;await hook();}this.database.exec("BEGIN IMMEDIATE");try{const results=statements.map((statement,index)=>{if(index===this.failAt)throw new Error("injected transactional failure");try {if(this.beforeStatement)this.beforeStatement(statement,index);return statement.execute();} catch(error) {this.lastFailure={index,message:error.message};throw error;}});this.database.exec("COMMIT");return results;}catch(error){this.database.exec("ROLLBACK");throw error;}}
}
export async function setup({previous=false,ready=true}={}) {
  const database=createIsolatedDatabase();const plan=await loadMigrationPlan();applyMigrationPlan(database,previous?plan.slice(0,10):plan,{now});
  for(const statement of developmentSeedStatements(await buildDevelopmentSeed()))database.prepare(statement.sql).run(...statement.params);
  if(ready)for(const region of ["west","east","north","central","south"]){const prototype={...database.prepare("SELECT * FROM questions WHERE stable_id=?").get(`${region}_q01`)};const columns=Object.keys(prototype);const insert=database.prepare(`INSERT INTO questions(${columns.map(name=>`"${name}"`).join(",")}) VALUES(${columns.map(()=>"?").join(",")})`);for(let i=0;i<18;i++){const row={...prototype,id:`question_local_d_${region}_${i}`,stable_id:`${region}_d_extra_${i}`};insert.run(...columns.map(name=>row[name]));}}
  const adapter=new Adapter(database);const repository=new D1CommerceRepository(adapter);const service=new CommerceService(repository,new InMemoryCommerceRateLimiter(),config,()=>now,{cowriePurchasesEnabled:true});
  const walletRepository=new D1CowrieWalletRepository(adapter,new D1QuestionSelectionRepository(adapter));let byte=1;const walletService=new CowrieWalletService(walletRepository,{now:()=>now,randomSource:bytes=>{bytes.fill(byte++);return bytes;}});const created=await walletService.createOrGet({anonymousSessionCredential:credential});
  return{database,adapter,repository,service,walletRepository,walletService,created,plan};
}
export function request(context,key="cowrie_5_v1",id="1") {return{productKey:key,walletReference:context.created.wallet.walletReference,anonymousSessionCredential:credential,idempotencyKey:id.repeat(32),immediateDeliveryConsent:true,consentNoticeVersion:COWRIE_DELIVERY_NOTICE_VERSION};}
let eventNumber=0;
export function rawEvent(type,object,extra={}){return JSON.stringify({id:`evt_local_D_${++eventNumber}`,type,livemode:false,data:{object},...extra});}
export function sign(raw,timestamp=Math.floor(now/1000)){return `t=${timestamp},v1=${createHmac("sha256",config.webhookSigningSecret).update(`${timestamp}.${raw}`).digest("hex")}`;}
export async function verified(type,object,extra={}){const raw=rawEvent(type,type==="charge.dispute.created"?{...object,id:"dp_local_D_dispute"}:object,extra);return verifyStripeWebhook({rawBody:raw,signatureHeader:sign(raw),config,now});}
export function checkout(order,key="cowrie_5_v1",intent="pi_local_D_primary",status="paid"){return{id:`cs_local_D_${intent.slice(3)}`,client_reference_id:order.publicOrderReference,payment_link:config.cowrieBundles[key].expectedPaymentLinkId,payment_intent:intent,amount_total:cowrieProducts[key].amountMinor,currency:"gbp",mode:"payment",payment_status:status};}
export function adverse(intent="pi_local_D_primary",amount=199,refunded=amount){return{id:"ch_local_D_refund",payment_intent:intent,amount,amount_refunded:refunded,currency:"gbp"};}
export function balance(context){return {...context.database.prepare("SELECT purchased_balance,bonus_balance FROM cowrie_wallets LIMIT 1").get()};}
export function state(context,order){return context.database.prepare("SELECT state FROM commerce_orders WHERE public_order_reference=?").get(order.publicOrderReference).state;}
