import {type PublicSellerDetails,parseSellerDetails} from './sellerDetails.ts';
import {COWRIE_DELIVERY_NOTICE_VERSION,cowrieProducts,type CommerceProductKey} from '../db/cowrieProducts.ts';
import {ROYAL_REVEAL_CONSENT_NOTICE_VERSION} from '../db/commerceContracts.ts';
import {PURCHASE_TERMS_VERSION,REQUESTED_SALES_COUNTRIES,PURCHASE_TERMS,COWRIE_PURCHASE_CONSENT,ROYAL_PURCHASE_CONSENT} from './purchaseTerms.ts';
export {PURCHASE_TERMS_VERSION,REQUESTED_SALES_COUNTRIES,PURCHASE_TERMS} from './purchaseTerms.ts';
export type ConfirmationDetails=Readonly<{email:string;residenceCountry:string;termsVersion:typeof PURCHASE_TERMS_VERSION;adultPurchase:true}>;
export type ConfirmationDraft=Readonly<{orderId:string;contractHash:string;encryptedContract:string;encryptedRecipient:string;createdAt:number}>;
export type ConfirmationInput=Readonly<{orderId:string;publicOrderReference:string;productKey:CommerceProductKey;amountMinor:number;currency:'GBP';createdAt:number;consentAt:number;details:ConfirmationDetails}>;
export type PurchaseConfirmationPolicy=Readonly<{
 parse:(value:unknown)=>Readonly<{request:unknown;details:ConfirmationDetails}>;
 prepare:(input:ConfirmationInput)=>Promise<ConfirmationDraft>;
 checkPending:(orderId:string,ownerHash:string,details:ConfirmationDetails)=>Promise<void>;
 read:(orderId:string,ownerHash:string)=>Promise<unknown>;
 settle:(orderId:string,ownerHash:string,proof:Readonly<{eventId:string;rawBody:string}>)=>Promise<unknown>;
 deliver:(orderId:string,ownerHash:string)=>Promise<unknown>;
 cancel:(orderId:string)=>Promise<unknown>;
}>;
export type ConfirmationAuthority=Readonly<{preparePurchaseConfirmation:(input:unknown)=>Promise<ConfirmationDraft>;checkPendingPurchaseConfirmation:(orderId:string,ownerHash:string,details:ConfirmationDetails)=>Promise<boolean>;purchaseConfirmation:(orderId:string,ownerHash:string)=>Promise<unknown>;recordPurchasePayment:(orderId:string,ownerHash:string,proof:Readonly<{eventId:string;rawBody:string}>)=>Promise<unknown>;deliverPurchaseConfirmation:(orderId:string,ownerHash:string)=>Promise<unknown>;cancelPurchaseConfirmation:(orderId:string)=>Promise<unknown>}>;
const fail=():never=>{throw Error('purchase_confirmation_unavailable');};
export function productionPurchasePolicy(seller:PublicSellerDetails,authority:ConfirmationAuthority,countries:readonly string[]):PurchaseConfirmationPolicy {
 if(!parseSellerDetails(JSON.stringify(seller))||!Array.isArray(countries)||!countries.length||countries.some(c=>!REQUESTED_SALES_COUNTRIES.includes(c))||new Set(countries).size!==countries.length||['preparePurchaseConfirmation','checkPendingPurchaseConfirmation','purchaseConfirmation','recordPurchasePayment','deliverPurchaseConfirmation','cancelPurchaseConfirmation'].some(k=>typeof authority?.[k as keyof ConfirmationAuthority]!=='function'))return fail();
 const details=(value:unknown):ConfirmationDetails=>{if(!value||typeof value!=='object'||Array.isArray(value))return fail();const v=value as Record<string,unknown>;if(Object.keys(v).sort().join()!=='adultPurchase,email,residenceCountry,termsVersion'||v.adultPurchase!==true||v.termsVersion!==PURCHASE_TERMS_VERSION||typeof v.residenceCountry!=='string'||!countries.includes(v.residenceCountry)||typeof v.email!=='string'||v.email.length>254||!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(v.email))return fail();return Object.freeze(v as ConfirmationDetails);};
 return Object.freeze({parse(value){if(!value||typeof value!=='object'||Array.isArray(value))return fail();const {confirmation,...request}=value as Record<string,unknown>;return {request,details:details(confirmation)};},
  prepare(input){const d=details(input.details),royal=input.productKey==='royal_reveal_v1';if(input.amountMinor!==(royal?199:cowrieProducts[input.productKey as keyof typeof cowrieProducts]?.amountMinor))return fail();return authority.preparePurchaseConfirmation({...input,seller,adultPurchase:d.adultPurchase,email:d.email,residenceCountry:d.residenceCountry,termsVersion:d.termsVersion,terms:PURCHASE_TERMS,consentText:royal?ROYAL_PURCHASE_CONSENT:COWRIE_PURCHASE_CONSENT,consentNoticeVersion:royal?ROYAL_REVEAL_CONSENT_NOTICE_VERSION:COWRIE_DELIVERY_NOTICE_VERSION});},
  async checkPending(orderId,ownerHash,value){if(await authority.checkPendingPurchaseConfirmation(orderId,ownerHash,details(value))!==true)return fail();},read:(orderId,ownerHash)=>authority.purchaseConfirmation(orderId,ownerHash),settle:(orderId,ownerHash,proof)=>authority.recordPurchasePayment(orderId,ownerHash,proof),deliver:(orderId,ownerHash)=>authority.deliverPurchaseConfirmation(orderId,ownerHash),cancel:(orderId)=>authority.cancelPurchaseConfirmation(orderId)});
}
