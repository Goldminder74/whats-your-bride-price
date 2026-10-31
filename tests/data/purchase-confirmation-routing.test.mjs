import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseConfirmationMail,purchaseConfirmationText} from '../../worker/purchaseConfirmationMail.mjs';
import {resolveCustomerContact} from '../../app/customerContact.ts';

const googleContact=resolveCustomerContact('google-workspace');
const legacy={WYBP_ALERT_SENDER:'noreply@classesforculture.com',WYBP_SMTP_USERNAME:'noreply@classesforculture.com',WYBP_SMTP_PASSWORD:'synthetic-legacy-password'};
const google={WYBP_PURCHASE_MAIL_PROVIDER:'google-workspace-relay',WYBP_PURCHASE_MAIL_SENDER:'receipts@mail.classesforculture.com',WYBP_PURCHASE_MAIL_USERNAME:'backup-operator@classesforculture.com',WYBP_PURCHASE_MAIL_PASSWORD:'synthetic-google-password'};
const historical={version:1,publicOrderReference:'rr_'+'a'.repeat(32),productKey:'cowrie_40_v1',originalCurrency:'GBP',originalAmountMinor:999,payment:{version:1,integrationCurrency:'GBP',integrationAmountMinor:999,presentmentCurrency:'EUR',presentmentAmountMinor:1234},seller:{version:1,legalName:'Ayodele Ayeni',tradingName:'Classes for Culture',geographicalAddress:'Synthetic seller address only',complaintsAddress:null,telephone:null,supportEmail:'team@classesforculture.com',privacyEmail:'team@classesforculture.com'},terms:'Historical synthetic terms and original contact, unchanged. Statutory rights remain.',termsVersion:'classes-for-culture-purchases-2026-10-23',consent:{text:'Synthetic immediate-access request; no cancellation waiver.',acceptedAt:1}};
const newContracts=[
 {...historical,seller:{...historical.seller,supportEmail:googleContact.email}},
 {...historical,seller:{...historical.seller,privacyEmail:googleContact.email}},
 {...historical,termsVersion:googleContact.termsVersion},
 {...historical,seller:{...historical.seller,supportEmail:googleContact.email,privacyEmail:googleContact.email},termsVersion:googleContact.termsVersion},
];
function smtp(hostname){
 let calls=0,controller;const payloads=[];
 return {calls:()=>calls,payloads,connect(address,options){calls++;assert.deepEqual(address,{hostname,port:465});assert.deepEqual(options,{secureTransport:'on'});return {opened:Promise.resolve(),readable:new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode('220 ready\r\n'));}}),writable:new WritableStream({write(bytes){const text=new TextDecoder().decode(bytes);if(text.startsWith('From:'))payloads.push(text);const response=text.startsWith('EHLO')?'250 ready':text.startsWith('AUTH')?'235 accepted':text==='DATA\r\n'?'354 ready':'250 accepted';controller.enqueue(new TextEncoder().encode(response+'\r\n'));}}),async close(){}};}};
}
const input=contract=>({recipient:'synthetic@example.invalid',contract});
const decoded=raw=>Buffer.from(raw.split('\r\n\r\n')[1].split('\r\n.')[0].replaceAll('\r\n',''),'base64').toString();

test('each immutable Google contact/version signal rejects absent or legacy provider before connecting',async()=>{
 let calls=0;const connect=()=>{calls++;throw Error('must not connect');};
 for(const contract of newContracts)for(const env of [legacy,{...legacy,WYBP_PURCHASE_MAIL_PROVIDER:'privateemail'}])await assert.rejects(purchaseConfirmationMail(env,connect)(input(contract)),/^Error: purchase_confirmation_mail_unavailable$/);
 assert.equal(calls,0);
});
test('Google contracts reject invalid providers and incomplete Google credentials without falling back',async()=>{
 let calls=0;const connect=()=>{calls++;throw Error('must not connect');};
 for(const provider of ['',null,'google-workspace','arbitrary'])assert.throws(()=>purchaseConfirmationMail({...legacy,...google,WYBP_PURCHASE_MAIL_PROVIDER:provider},connect),/^Error: purchase_mail_transport_configuration$/);
 for(const change of [{WYBP_PURCHASE_MAIL_PASSWORD:undefined},{WYBP_PURCHASE_MAIL_PASSWORD:''},{WYBP_PURCHASE_MAIL_SENDER:'noreply@classesforculture.com'},{WYBP_PURCHASE_MAIL_USERNAME:'noreply@classesforculture.com'}])assert.throws(()=>purchaseConfirmationMail({...legacy,...google,...change},connect),/^Error: purchase_mail_transport_configuration$/);
 assert.equal(calls,0);
});
test('Google contracts use only the fixed Google relay and keep verified converted totals and immutable text',async()=>{
 for(const contract of newContracts){const f=smtp('smtp-relay.gmail.com'),before=JSON.stringify(contract);assert.deepEqual(await purchaseConfirmationMail({...legacy,...google},f.connect)(input(contract)),{accepted:true,receiptVerified:false});assert.equal(f.calls(),1);assert.equal(f.payloads.length,1);assert.equal(decoded(f.payloads[0]),purchaseConfirmationText(contract));assert.match(decoded(f.payloads[0]),/Customer payment: EUR 12.34/);assert.equal(JSON.stringify(contract),before);}
});
test('historical contracts can use Google without changing their stored contacts, terms or amounts',async()=>{
 const f=smtp('smtp-relay.gmail.com'),before=JSON.stringify(historical);assert.equal((await purchaseConfirmationMail({...legacy,...google},f.connect)(input(historical))).accepted,true);assert.equal(f.calls(),1);assert.equal(decoded(f.payloads[0]),purchaseConfirmationText(historical));assert.match(decoded(f.payloads[0]),/team@classesforculture\.com/);assert.equal(JSON.stringify(historical),before);
});
test('existing legacy private-game contracts retain unset and explicit legacy provider behaviour',async()=>{
 for(const env of [legacy,{...legacy,WYBP_PURCHASE_MAIL_PROVIDER:'privateemail'}]){const f=smtp('mail.privateemail.com');assert.equal((await purchaseConfirmationMail(env,f.connect)(input(historical))).accepted,true);assert.equal(f.calls(),1);assert.equal(decoded(f.payloads[0]),purchaseConfirmationText(historical));}
});
test('changing the environment after construction cannot relabel a captured legacy transport as Google',async()=>{
 const env={...legacy};let calls=0;const send=purchaseConfirmationMail(env,()=>{calls++;throw Error('must not connect');});Object.assign(env,google);await assert.rejects(send(input(newContracts[3])),/^Error: purchase_confirmation_mail_unavailable$/);assert.equal(calls,0);
});
