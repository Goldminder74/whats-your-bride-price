import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { authoritySnapshot, assertEmptyOperationalSource } from '../../worker/authoritySnapshot.mjs';
import { authorityMail } from '../../worker/authorityMail.mjs';
import { decryptRecord, recoveryHash } from '../../scripts/recovery-crypto.mjs';

function fixture() {
  const sql=new DatabaseSync(':memory:');
  sql.exec("CREATE TABLE operational_recovery_checkpoints(id TEXT PRIMARY KEY,state TEXT,manifest_hash TEXT,sequence INTEGER,head_hash TEXT); INSERT INTO operational_recovery_checkpoints VALUES('journal','exporting','synthetic_one',0,'zero'); CREATE TABLE synthetic_rows(id TEXT PRIMARY KEY,value BLOB); INSERT INTO synthetic_rows VALUES('a',X'0102'),('b',X'0304'),('c',NULL)");
  const db={async query(s,p=[]){return sql.prepare(s).all(...p);}};
  const files=new Map(); let uploads=0;
  const custody={async get(n){return files.get(n)||null;},async put(n,b){if(files.has(n))assert.deepEqual(files.get(n),b);else{files.set(n,b);uploads++;}return recoveryHash(b);}};
  const key=randomBytes(32),head={state:'exporting',manifest_hash:'synthetic_one',sequence:0,head_hash:'zero'};
  return {sql,db,custody,key,head,files,uploads:()=>uploads};
}

test('empty-baseline commissioning rejects application or financial rows before custody operations',async()=>{
 const f=fixture();try{
  await assert.rejects(assertEmptyOperationalSource(f.db),/^Error: nonempty_operational_source$/);
  f.sql.exec('DELETE FROM synthetic_rows; CREATE TABLE operational_authority_outbox(id TEXT PRIMARY KEY);');
  await assertEmptyOperationalSource(f.db);
  f.sql.exec("INSERT INTO operational_authority_outbox VALUES('synthetic-event')");
  await assert.rejects(assertEmptyOperationalSource(f.db),/^Error: nonempty_operational_source$/);
 }finally{f.sql.close();}
});
test('fenced encrypted snapshot exports every row, preserves binary data and retries immutable pages',async()=>{
  const f=fixture();try {
    const capture=authoritySnapshot(f.db,f.custody,f.key,{pageSize:2});
    const first=await capture(f.head),second=await capture(f.head);
    assert.deepEqual(second,first);assert.equal(first.counts.synthetic_rows,3);assert.equal(f.uploads(),3);
    const rows=first.files.filter(x=>x.name.includes('.t')).flatMap(x=>decryptRecord(f.files.get(x.name),f.key,x.name).rows);
    assert.deepEqual(rows.map(x=>x.id),['a','b','c']);assert.deepEqual(rows[0].value,{binary:'AQI='});
    for(const bytes of f.files.values())assert.equal(bytes.toString().includes('synthetic_rows'),false);
  }finally{f.sql.close();}
});
test('interrupted snapshot resumes same ciphertext and detects conflicting source or absent fence',async()=>{
  const f=fixture();try {
    let fail=true;const original=f.custody.put;
    f.custody.put=async(n,b)=>{const result=await original(n,b);if(fail&&n.includes('.t')){fail=false;throw Error('lost_ack');}return result;};
    const capture=authoritySnapshot(f.db,f.custody,f.key,{pageSize:2});
    await assert.rejects(capture(f.head),/lost_ack/);await capture(f.head);assert.equal(f.uploads(),3);
    f.sql.exec("UPDATE synthetic_rows SET value='changed' WHERE id='a'");
    await assert.rejects(capture(f.head),/snapshot_retry_conflict/);
    f.sql.exec("UPDATE operational_recovery_checkpoints SET state='idle'");
    await assert.rejects(capture(f.head),/snapshot_fence_changed/);
  }finally{f.sql.close();}
});
test('snapshot never silently truncates when capacity or readback integrity fails',async()=>{
  const f=fixture();try {
    await assert.rejects(authoritySnapshot(f.db,f.custody,f.key,{pageSize:1,maxPages:1})(f.head),/snapshot_capacity/);
    const get=f.custody.get;let reads=0;f.custody.get=async n=>{const b=await get(n);return b&&++reads===2?Buffer.from('corrupt'):b;};
    await assert.rejects(authoritySnapshot(f.db,f.custody,f.key)(f.head));
  }finally{f.sql.close();}
});

const env={WYBP_ALERT_SENDER:'noreply@classesforculture.com',WYBP_SMTP_USERNAME:'noreply@classesforculture.com',WYBP_SMTP_PASSWORD:'synthetic-password'};
function smtp({rejectAuth=false,dropData=false}={}) {
  const commands=[];let controller,closed=false;
  const readable=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode('220 ready\r\n'));}});
  const writable=new WritableStream({write(bytes){const s=new TextDecoder().decode(bytes);commands.push(s);
    if(dropData&&s.startsWith('From:')){controller.close();return;}
    const answer=s.startsWith('EHLO')?'250-test\r\n250 AUTH PLAIN':s.startsWith('AUTH')?(rejectAuth?'535 rejected':'235 accepted'):s==='DATA\r\n'?'354 ready':'250 accepted';
    controller.enqueue(new TextEncoder().encode(answer+'\r\n'));
  }});
  return {commands,connect(address,options){assert.deepEqual(address,{hostname:'mail.privateemail.com',port:465});assert.equal(options.secureTransport,'on');return {readable,writable,opened:Promise.resolve(),async close(){closed=true;}};},closed:()=>closed};
}
test('approved labelled alert uses fixed recipient and TLS, requires separate sender credentials',async()=>{
  const f=smtp();const result=await authorityMail(env,f.connect)({component:'authority',status:'verified',at:Date.now(),test:true,privateData:'never-include'});
  assert.deepEqual(result,{accepted:true,receiptVerified:false});assert.equal(f.closed(),true);
  const body=f.commands.find(s=>s.startsWith('From:'));assert.match(body,/Subject: \[TEST - synthetic data\]/);assert.equal(body.includes('never-include'),false);assert.equal(body.includes(env.WYBP_SMTP_PASSWORD),false);
  assert.throws(()=>authorityMail({...env,WYBP_ALERT_SENDER:'another@example.com'},f.connect),/configuration/);
});
test('SMTP rejection, connection errors and uncertain delivery expose only sanitised status',async()=>{
  await assert.rejects(authorityMail(env,smtp({rejectAuth:true}).connect)({component:'authority',status:'blocked',at:0}),/^Error: alert_transport_unavailable$/);
  await assert.rejects(authorityMail(env,()=>{throw Error('private-password');})({component:'authority',status:'blocked',at:0}),/^Error: alert_transport_unavailable$/);
  await assert.rejects(authorityMail(env,smtp({dropData:true}).connect)({component:'authority',status:'verified',at:0,test:true}),/^Error: alert_delivery_uncertain$/);
});
test('SMTP deadline closes a stalled connection without exposing credentials',async()=>{
  let closed=false;await assert.rejects(authorityMail(env,()=>({opened:new Promise(()=>{}),async close(){closed=true;}}),{timeoutMs:5})({component:'authority',status:'blocked',at:0}),/^Error: alert_transport_unavailable$/);assert.equal(closed,true);
});
test('operational configuration binds only the approved isolated database and has no public URLs, cron or secrets',()=>{
  const config=readFileSync('wrangler.operations.jsonc','utf8'),source=readFileSync('worker/operations.mjs','utf8');
  assert.match(config,/"workers_dev": false/);assert.match(config,/"preview_urls": false/);
  assert.doesNotMatch(config,/"triggers"|"routes"|"WYBP_DRIVE_CLIENT_SECRET"/);
  assert.match(config,/"database_id":"a5b2b409-ed08-48c9-ac1d-36699fc6c4b9"/);
  assert.doesNotMatch(config,/1a268b28-e6d5-4431-8f84-a886df9369f1/);
  assert.doesNotMatch(source,/scheduled\(|console\.|runtime\(\)\s*\{/);
  assert.match(source,/ON CONFLICT\(id\) DO NOTHING RETURNING id/);
  assert.match(source,/fetch\(\).*status:404/);
});
