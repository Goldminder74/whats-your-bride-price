import {privateEmailTransport} from './authorityMail.mjs';
import {stripeMoney} from '../db/stripeMoney.mjs';
const fail=()=>{throw Error('purchase_confirmation_mail_unavailable');};
export function purchaseConfirmationText(contract){
 const product={cowrie_5_v1:'5 Cowries',cowrie_15_v1:'15 Cowries',cowrie_40_v1:'40 Cowries',royal_reveal_v1:'Royal Reveal'}[contract?.productKey];
 if(contract?.version!==1||!/^rr_[0-9a-f]{32}$/.test(contract.publicOrderReference||'')||contract.originalCurrency!=='GBP'||!Number.isSafeInteger(contract.originalAmountMinor)||contract.originalAmountMinor<1||!contract.seller||typeof contract.terms!=='string'||typeof contract.consent?.text!=='string'||!Number.isSafeInteger(contract.consent.acceptedAt))fail();
 if(!product)fail();
 const s=contract.seller,p=contract.payment;
 if(!p||p.version!==1||p.integrationCurrency!=='GBP'||p.integrationAmountMinor!==contract.originalAmountMinor)fail();
 return ['Classes for Culture — purchase confirmation','Order: '+contract.publicOrderReference,'Product: '+product,'Original GBP price: '+stripeMoney('GBP',contract.originalAmountMinor),'Customer payment: '+stripeMoney(p.presentmentCurrency,p.presentmentAmountMinor),'Seller: '+s.legalName+' trading as '+s.tradingName,'Business address: '+s.geographicalAddress,...(s.complaintsAddress?['Complaints address: '+s.complaintsAddress]:[]),...(s.telephone?['Telephone: '+s.telephone]:[]),'Support, privacy and complaints: '+s.supportEmail,'We aim to acknowledge enquiries within two working days. Unresolved complaints are escalated to Classes for Culture.','','Terms ('+contract.termsVersion+'):',contract.terms,'','Your recorded request:',contract.consent.text,'Accepted at: '+new Date(contract.consent.acceptedAt).toISOString(),'','Keep this confirmation. Your statutory rights remain.'].join('\n');
}
export function purchaseConfirmationMail(env,connect,options){const send=privateEmailTransport(env,connect,options);return async({recipient,contract})=>send({to:recipient,subject:'Your Classes for Culture purchase confirmation',body:purchaseConfirmationText(contract)});}
