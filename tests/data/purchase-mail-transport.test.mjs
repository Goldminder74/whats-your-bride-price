import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityMail,purchaseEmailTransport} from '../../worker/authorityMail.mjs';

const google={WYBP_PURCHASE_MAIL_PROVIDER:'google-workspace-relay',WYBP_PURCHASE_MAIL_SENDER:'receipts@mail.classesforculture.com',WYBP_PURCHASE_MAIL_USERNAME:'backup-operator@classesforculture.com',WYBP_PURCHASE_MAIL_PASSWORD:'synthetic-google-app-password'};
const legacy={WYBP_ALERT_SENDER:'noreply@classesforculture.com',WYBP_SMTP_USERNAME:'noreply@classesforculture.com',WYBP_SMTP_PASSWORD:'synthetic-legacy-password'};
const mail={to:'synthetic@example.invalid',subject:'Synthetic purchase confirmation',body:'Customer payment: EUR 12.34\nSynthetic terms — statutory rights remain.'};
function smtp({hostname='smtp-relay.gmail.com',dropData=false,rejectAuth=false}={}){
 let controller,closed=false,calls=0;const commands=[];
 return {commands,closed:()=>closed,calls:()=>calls,connect(address,options){calls++;assert.deepEqual(address,{hostname,port:465});assert.deepEqual(options,{secureTransport:'on'});
  return {opened:Promise.resolve(),readable:new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode('220 ready\r\n'));}}),writable:new WritableStream({write(bytes){const value=new TextDecoder().decode(bytes);commands.push(value);if(dropData&&value.startsWith('From:')){controller.close();return;}const response=value.startsWith('EHLO')?'250-AUTH PLAIN\r\n250 ready':value.startsWith('AUTH')?(rejectAuth?'535 rejected':'235 accepted'):value==='DATA\r\n'?'354 ready':'250 accepted';controller.enqueue(new TextEncoder().encode(response+'\r\n'));}}),async close(){closed=true;}};
 }};
}
test('Google customer transport uses the fixed TLS relay and separate credentials without Namecheap fallback',async()=>{
 const f=smtp();assert.deepEqual(await purchaseEmailTransport(google,f.connect)(mail),{accepted:true,receiptVerified:false});assert.equal(f.calls(),1);assert.equal(f.closed(),true);
 assert.ok(f.commands.includes('EHLO mail.classesforculture.com\r\n'));assert.ok(f.commands.includes('MAIL FROM:<receipts@mail.classesforculture.com>\r\n'));
 const auth=f.commands.find(v=>v.startsWith('AUTH PLAIN '));assert.equal(Buffer.from(auth.slice(11).trim(),'base64').toString(),'\0'+google.WYBP_PURCHASE_MAIL_USERNAME+'\0'+google.WYBP_PURCHASE_MAIL_PASSWORD);
 const data=f.commands.find(v=>v.startsWith('From:'));assert.equal(data.includes(google.WYBP_PURCHASE_MAIL_PASSWORD),false);assert.match(data,/From: receipts@mail\.classesforculture\.com/);
 const body=data.split('\r\n\r\n')[1].split('\r\n.')[0].replaceAll('\r\n','');assert.equal(Buffer.from(body,'base64').toString(),mail.body);
});
test('unknown providers, sender/username injection and missing Google credentials reject before connection',()=>{
 let calls=0;const connect=()=>{calls++;throw Error('must not connect');};
 for(const change of [{WYBP_PURCHASE_MAIL_PROVIDER:''},{WYBP_PURCHASE_MAIL_PROVIDER:'arbitrary'},{WYBP_PURCHASE_MAIL_SENDER:'receipts@other.invalid'},{WYBP_PURCHASE_MAIL_SENDER:'receipts@mail.classesforculture.com\r\nBcc:other'},{WYBP_PURCHASE_MAIL_USERNAME:'noreply@classesforculture.com'},{WYBP_PURCHASE_MAIL_PASSWORD:''},{WYBP_PURCHASE_MAIL_PASSWORD:'bad\0value'},{WYBP_PURCHASE_MAIL_PASSWORD:'bad\r\nvalue'},{WYBP_PURCHASE_MAIL_PASSWORD:'x'.repeat(513)}])assert.throws(()=>purchaseEmailTransport({...legacy,...google,...change},connect),/purchase_mail_transport_configuration/);
 assert.equal(calls,0);
});
test('customer Google selection leaves operational alerts on the existing provider and recipient',async()=>{
 const f=smtp({hostname:'mail.privateemail.com'});await authorityMail({...legacy,...google},f.connect)({component:'authority',status:'verified',at:0,test:true});assert.ok(f.commands.includes('RCPT TO:<noreply@classesforculture.com>\r\n'));assert.ok(f.commands.includes('MAIL FROM:<noreply@classesforculture.com>\r\n'));assert.equal(f.calls(),1);
});
test('unchanged legacy customer configuration keeps its existing transport',async()=>{
 for(const env of [legacy,{...legacy,WYBP_PURCHASE_MAIL_PROVIDER:'privateemail'}]){const f=smtp({hostname:'mail.privateemail.com'});assert.equal((await purchaseEmailTransport(env,f.connect)(mail)).accepted,true);assert.equal(f.calls(),1);}
});
test('Google rejection and lost final acknowledgement stay sanitised with no transport retry or fallback',async()=>{
 for(const [options,error]of [[{rejectAuth:true},'alert_transport_unavailable'],[{dropData:true},'alert_delivery_uncertain']]){const f=smtp(options);await assert.rejects(purchaseEmailTransport({...legacy,...google},f.connect)(mail),new RegExp('^Error: '+error+'$'));assert.equal(f.calls(),1);assert.equal(f.closed(),true);}
});
test('Google customer content and time bounds reject injection and close a stalled connection',async()=>{
 let calls=0;const send=purchaseEmailTransport(google,()=>{calls++;throw Error('must not connect');});
 for(const change of [{to:'synthetic@example.invalid\r\nBcc:other'},{subject:'Purchase\r\nBcc:other'},{body:'x'.repeat(65537)}])await assert.rejects(send({...mail,...change}),/mail_content_unavailable/);assert.equal(calls,0);
 for(const timeoutMs of [0,Infinity,NaN,30001])assert.throws(()=>purchaseEmailTransport(google,()=>{}, {timeoutMs}),/mail_transport_configuration/);
 let closed=false;await assert.rejects(purchaseEmailTransport(google,()=>({opened:new Promise(()=>{}),async close(){closed=true;}}),{timeoutMs:5})(mail),/^Error: alert_transport_unavailable$/);assert.equal(closed,true);
});
