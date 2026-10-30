import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { authoritySnapshot, assertEmptyOperationalSource } from '../../worker/authoritySnapshot.mjs';
import { authorityMail } from '../../worker/authorityMail.mjs';
import { decryptRecord, recoveryHash } from '../../scripts/recovery-crypto.mjs';
import { operationalMaintenance,operationalSnapshotMaintenance,operationalHeartbeat } from '../../worker/operationalMaintenance.mjs';

test('bounded snapshot monitoring distinguishes capture, scratch cleanup and verified completion',async()=>{
 const calls=[],status=[];let capture=false,compacted=false;
 const service={async advanceSnapshot(id){assert.equal(id,'synthetic_boundary');calls.push('capture');return {complete:capture,receipt:'a'.repeat(64)};},async cleanupSnapshotStep(){calls.push('cleanup');return {complete:compacted,receipt:'a'.repeat(64)};},async ready(){calls.push('ready');}};
 const deps={heartbeat:async event=>status.push(event.status)};
 assert.deepEqual(await operationalSnapshotMaintenance(service,deps,'synthetic_boundary'),{verified:false,snapshotComplete:false,cleanupComplete:false});
 assert.deepEqual(calls,['capture']);assert.deepEqual(status,['snapshot']);
 capture=true;calls.length=0;const cleanup=await operationalSnapshotMaintenance(service,deps,'synthetic_boundary');assert.equal(cleanup.verified,false);assert.equal(cleanup.cleanupComplete,false);assert.deepEqual(calls,['capture','cleanup']);assert.equal(status.at(-1),'snapshot_cleanup');
 compacted=true;calls.length=0;const done=await operationalSnapshotMaintenance(service,deps,'synthetic_boundary');assert.equal(done.verified,true);assert.deepEqual(calls,['capture','cleanup','ready']);assert.equal(status.at(-1),'verified');assert.equal(Object.hasOwn(done,'runtimeAccess'),false);
});

test('snapshot maintenance rejects absent monitoring, conflicting receipts and each failure without claiming completion',async()=>{
 const statuses=[],service={async advanceSnapshot(){return {complete:true,receipt:'a'.repeat(64)};},async cleanupSnapshotStep(){return {complete:true,receipt:'a'.repeat(64)};},async ready(){}};
 await assert.rejects(operationalSnapshotMaintenance({advanceSnapshot:()=>assert.fail('must validate monitor first')},{},'synthetic_boundary'),/operational_configuration/);
 for(const stage of ['advanceSnapshot','cleanupSnapshotStep','ready']){
  await assert.rejects(operationalSnapshotMaintenance({...service,[stage]:async()=>{throw Error('synthetic provider detail');}},{heartbeat:async e=>statuses.push(e.status)},'synthetic_boundary'),/^Error: operational_snapshot_maintenance_unavailable$/);
 }
 await assert.rejects(operationalSnapshotMaintenance({...service,cleanupSnapshotStep:async()=>({complete:true,receipt:'b'.repeat(64)})},{heartbeat:async e=>statuses.push(e.status)},'synthetic_boundary'),/^Error: operational_snapshot_maintenance_unavailable$/);
 assert.deepEqual(statuses,[]);
 await assert.rejects(operationalSnapshotMaintenance(service,{heartbeat:async()=>{throw Error('synthetic provider detail');}},'synthetic_boundary'),/^Error: operational_snapshot_maintenance_unavailable$/);
});

test('private maintenance orders recovery, bounded purge, verified delivery and independent heartbeat',async()=>{
  const calls=[];
  const service={async ready(){calls.push('ready');},async flush(_id,limit){assert.equal(limit,25);calls.push('deliver');return {pending:0};},async deliver(){throw Error('must not snapshot in a purge tick');}};
  const deps={now:()=>123,async purge(_service,at,limit){assert.equal(at,123);assert.equal(limit,50);calls.push('purge');},async heartbeat(){calls.push('heartbeat');}};
  assert.equal((await operationalMaintenance(service,deps,'op_synthetic')).verified,true);
  assert.deepEqual(calls,['ready','purge','deliver','ready','heartbeat']);
  calls.length=0;
  await assert.rejects(operationalMaintenance(service,{...deps,heartbeat:null},'op_synthetic'),/configuration/);
  assert.deepEqual(calls,[]);
  for(const stage of ['purge','deliver','heartbeat']){
    calls.length=0;
    const failure=async()=>{throw Error('synthetic credential must not leak');};
    await assert.rejects(operationalMaintenance({...service,...(stage==='deliver'?{flush:failure}:{})},{...deps,...(stage!=='deliver'?{[stage]:failure}:{})},'op_retry'),/^Error: operational_maintenance_unavailable$/);
    if(stage==='purge')assert.deepEqual(calls,['ready']);
    if(stage==='deliver')assert.deepEqual(calls,['ready','purge']);
  }
});

test('maintenance reports undelivered backlog without manufacturing a snapshot receipt',async()=>{
 const status=[];const service={async ready(){},async flush(){return {delivered:25,pending:40};},async deliver(){assert.fail('full snapshot is separately authorised');}};
 const result=await operationalMaintenance(service,{purge:async()=>{},heartbeat:async e=>status.push(e.status)},'op_bounded');
 assert.deepEqual(status,['backlog']);assert.equal(result.snapshotCreated,false);assert.equal(result.delivery.pending,40);assert.equal(Object.hasOwn(result,'receipt'),false);
});

test('heartbeat refuses redirects, wrong origins and failures and emits no receipt or secret in its body',async()=>{
  const env={WYBP_HEARTBEAT_URL:'https://monitor.example/synthetic-secret',WYBP_HEARTBEAT_HOST:'monitor.example'};
  assert.throws(()=>operationalHeartbeat({...env,WYBP_HEARTBEAT_URL:'http://monitor.example/'}),/configuration/);
  assert.throws(()=>operationalHeartbeat({...env,WYBP_HEARTBEAT_HOST:'other.example'}),/configuration/);
  let sends=0;
  const heartbeat=operationalHeartbeat(env,async(_url,options)=>{
    sends++;assert.equal(options.redirect,'manual');
    const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body),['component','status','at']);
    assert.equal(body.status,'verified');assert.ok(!options.body.includes('synthetic-secret'));
    return {status:204};
  });
  await heartbeat({status:'verified',receipt:'not-for-monitor'});assert.equal(sends,1);
  await assert.rejects(operationalHeartbeat(env,async()=>({status:302}))({status:'verified'}),/^Error: operational_monitor_unavailable$/);
  await assert.rejects(operationalHeartbeat(env,async()=>{throw Error('secret');})({status:'verified'}),/^Error: operational_monitor_unavailable$/);
});

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

test('snapshot keysets cover composite keys and never issue offset scans',async()=>{
 const f=fixture();try{
  f.sql.exec("CREATE TABLE synthetic_composite(a TEXT NOT NULL,b INTEGER NOT NULL,PRIMARY KEY(a,b)); INSERT INTO synthetic_composite VALUES('a',1),('a',2),('b',1),('b',3),('c',1)");
  const db={async query(s,p=[]){assert.doesNotMatch(s,/\bOFFSET\b/i);return f.db.query(s,p);}};
  const result=await authoritySnapshot(db,f.custody,f.key,{pageSize:2})(f.head);
  const rows=result.files.filter(file=>file.name.includes('.t')).flatMap(file=>decryptRecord(f.files.get(file.name),f.key,file.name)).filter(page=>page.table==='synthetic_composite').flatMap(page=>page.rows);
  assert.deepEqual(rows.map(row=>[row.a,row.b]),[['a',1],['a',2],['b',1],['b',3],['c',1]]);
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

test('shared TLS transport rejects header injection before connecting and preserves UTF-8 purchase text',async()=>{
 const {privateEmailTransport}=await import('../../worker/authorityMail.mjs');let opened=0;
 const rejected=privateEmailTransport(env,()=>{opened++;throw Error();});
 await assert.rejects(rejected({to:'synthetic@example.invalid\r\nBcc:other@example.invalid',subject:'Purchase',body:'test'}),/mail_content/);
 await assert.rejects(rejected({to:'synthetic@example.invalid',subject:'Purchase\r\nBcc:other',body:'test'}),/mail_content/);assert.equal(opened,0);
 const f=smtp();assert.equal((await privateEmailTransport(env,f.connect)({to:'synthetic@example.invalid',subject:'Synthetic purchase confirmation',body:'GBP1.99 — terms and cancellation rights'})).accepted,true);
 const raw=f.commands.find(s=>s.startsWith('From:')),encoded=raw.split('\r\n\r\n')[1].split('\r\n.')[0].replaceAll('\r\n','');assert.equal(Buffer.from(encoded,'base64').toString(),'GBP1.99 — terms and cancellation rights');
});
