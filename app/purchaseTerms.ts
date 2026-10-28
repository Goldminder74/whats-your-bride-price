import {customerContact,resolveCustomerContact} from './customerContact.ts';
const legacyCowrieCancellation='Contact team@classesforculture.com within 14 days of purchase to cancel your Cowrie bundle. We will provide a full refund, including if you have used some credits. Remaining credits from that purchase will be withdrawn; we will not create a debt or remove unrelated purchased value. Refunds use the original payment method. Your statutory rights, including rights for faulty or misdescribed services, are unaffected.';
const legacyRoyalCancellation='Contact team@classesforculture.com within 14 days of purchase for a full refund, including if you have opened your Royal Reveal. Refunds use the original payment method. Your statutory rights remain.';
export const ROYAL_IMMEDIATE_DELIVERY_NOTICE='royal-reveal-immediate-delivery-2026-10-23';
export const REQUESTED_SALES_COUNTRIES=Object.freeze(['GB']);
const legacyPurchaseTerms='Free play and purchases are for adults aged 18 or over. Paid sales are initially available to UK residents only. One-off purchases: 5 Cowries GBP1.99, 15 Cowries GBP4.99, 40 Cowries GBP9.99; Royal Reveal GBP1.99 for the purchased result. After two free games, one Cowrie buys one eligible random Quick Play. Purchased Cowries do not expire; bonus Cowries expire after 180 days. Cowries cannot be transferred, resold or withdrawn as cash. Wallet freezing preserves the balance and is not a refund or completed wallet closure. Delivery follows verified payment. Royal Reveal downloads may be regenerated while the result is active, up to 90 days. '+legacyCowrieCancellation+' '+legacyRoyalCancellation+' Used credits, partial refunds, disputes and unreconciled amounts are handled individually without inventing debt or exchange rates. Contact team@classesforculture.com. We aim to acknowledge enquiries within two working days. Unresolved complaints are escalated to Classes for Culture.';
export const COWRIE_PURCHASE_CONSENT='I request immediate access to the purchased Cowries. This does not waive my cancellation or statutory rights.';
export const ROYAL_PURCHASE_CONSENT='I request immediate delivery of my Royal Reveal. This does not waive my cancellation or statutory rights.';

/** New contracts pin the selected contact/version; stored historical contracts
 * and their original addresses are never rewritten. */
export function purchaseTermsForContact(profile: unknown) {
 const contact=resolveCustomerContact(profile),replace=(text:string)=>text.replaceAll('team@classesforculture.com',contact.email);
 return Object.freeze({version:contact.termsVersion,cowrieCancellation:replace(legacyCowrieCancellation),royalCancellation:replace(legacyRoyalCancellation),terms:replace(legacyPurchaseTerms)});
}
const activePurchaseTerms=purchaseTermsForContact(customerContact.profile);
export const PURCHASE_TERMS_VERSION=activePurchaseTerms.version;
export const PURCHASE_TERMS=activePurchaseTerms.terms;
export const COWRIE_CANCELLATION_DRAFT=activePurchaseTerms.cowrieCancellation;
export const ROYAL_CANCELLATION_POLICY=activePurchaseTerms.royalCancellation;
