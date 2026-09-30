import { cowrieProducts,isCowrieProduct,COWRIE_DELIVERY_NOTICE_VERSION,type CowrieProductKey } from "../db/cowrieProducts.ts";
export const COWRIE_PENDING_ORDER_KEY="wybp-cowrie-pending-order-v1";
export const COWRIE_RETURN_POLL_LIMIT=12;
export const COWRIE_RETURN_POLL_INTERVAL_MS=1500;
const referencePattern=/^rr_[0-9a-f]{32}$/;
export function readPendingCowrieOrder(storage:Pick<Storage,"getItem"|"removeItem">):string|null {
  try{const value=storage.getItem(COWRIE_PENDING_ORDER_KEY);if(value&&referencePattern.test(value))return value;storage.removeItem(COWRIE_PENDING_ORDER_KEY);return null;}catch{return null;}
}
export function savePendingCowrieOrder(storage:Pick<Storage,"setItem">,reference:string):void{if(!referencePattern.test(reference))throw new Error("order unavailable");storage.setItem(COWRIE_PENDING_ORDER_KEY,reference);}
async function post(path:string,body:Record<string,unknown>,signal?:AbortSignal):Promise<Record<string,unknown>>{
 const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify(body),signal});if(!response.ok)throw new Error("unavailable");const value:unknown=await response.json();if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("unavailable");return value as Record<string,unknown>;
}
export async function readCowrieOffer(walletReference:string,anonymousSessionCredential:string,signal?:AbortSignal){
 const value=await post("/commerce/status",{walletReference,anonymousSessionCredential},signal);
 if(value.available!==true||!Array.isArray(value.bundles)||value.bundles.length!==3)throw new Error("unavailable");
 for(const [index,key] of (Object.keys(cowrieProducts) as CowrieProductKey[]).entries()){const actual=value.bundles[index];const expected=cowrieProducts[key];if(!actual||actual.productKey!==key||actual.quantity!==expected.quantity||actual.displayPrice!==expected.displayPrice)throw new Error("unavailable");}
 return true;
}
export async function createCowriePurchase(input:Readonly<{productKey:CowrieProductKey;walletReference:string;anonymousSessionCredential:string;consent:boolean;idempotencyKey:string}>){
 if(input.consent!==true||!isCowrieProduct(input.productKey))throw new Error("consent required");
 const value=await post("/commerce/orders",{productKey:input.productKey,walletReference:input.walletReference,anonymousSessionCredential:input.anonymousSessionCredential,idempotencyKey:input.idempotencyKey,immediateDeliveryConsent:true,consentNoticeVersion:COWRIE_DELIVERY_NOTICE_VERSION});
 const expected=cowrieProducts[input.productKey];
 if(typeof value.publicOrderReference!=="string"||!referencePattern.test(value.publicOrderReference)||value.productKey!==input.productKey||value.quantity!==expected.quantity||value.displayPrice!==expected.displayPrice||value.state!=="pending"||!Number.isSafeInteger(value.pendingExpiresAt)||Number(value.pendingExpiresAt)<=Date.now()||typeof value.paymentLinkUrl!=="string")throw new Error("unavailable");
 const link=new URL(value.paymentLinkUrl);if(link.origin!=="https://buy.stripe.com"||link.username||link.password||link.hash||!/^\/[0-9A-Za-z_-]+$/.test(link.pathname)||link.searchParams.get("client_reference_id")!==value.publicOrderReference||[...link.searchParams].length!==1)throw new Error("unavailable");
 return {reference:value.publicOrderReference,url:link.href};
}
export async function readCowriePurchaseStatus(publicOrderReference:string,anonymousSessionCredential:string,signal?:AbortSignal){
 if(!referencePattern.test(publicOrderReference))throw new Error("unavailable");const value=await post("/commerce/status",{publicOrderReference,anonymousSessionCredential},signal);
 if(!isCowrieProduct(value.productKey)||value.entitlementActive!==false||value.quantity!==cowrieProducts[value.productKey].quantity||typeof value.state!=="string"||!["pending","processing","paid","fulfilled","failed","refunded","disputed","expired","deleted","review_required"].includes(value.state))throw new Error("unavailable");
 const wallet=value.wallet as Record<string,unknown>;if(!wallet||![wallet.purchasedBalance,wallet.bonusBalance,wallet.totalBalance].every(item=>Number.isSafeInteger(item)&&Number(item)>=0)||Number(wallet.purchasedBalance)+Number(wallet.bonusBalance)!==wallet.totalBalance)throw new Error("unavailable");
 if(value.settlementCause!==undefined&&value.settlementCause!=="refund"&&value.settlementCause!=="dispute")throw new Error("unavailable");
 return {state:value.state,quantity:Number(value.quantity),totalBalance:Number(wallet.totalBalance),settlementCause:value.settlementCause as "refund"|"dispute"|undefined};
}
