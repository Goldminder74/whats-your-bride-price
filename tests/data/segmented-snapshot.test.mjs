import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {segmentedSnapshot,segmentedSnapshotPages} from '../../worker/segmentedSnapshot.mjs';
import {recoveryHash,decryptRecord} from '../../scripts/recovery-crypto.mjs';

function fixture(count=51003){
 const database=new DatabaseSync(':memory:'),files=new Map(),key=randomBytes(32);
 const expires=Date.now()+60000; // Test lifetime only; production uses the existing journal expiry.
 database.exec("CREATE TABLE operational_recovery_checkpoints(id TEXT PRIMARY KEY,state TEXT,manifest_hash TEXT,sequence INTEGER,head_hash TEXT,expires_at INTEGER); CREATE TABLE answers(id INTEGER PRIMARY KEY,value TEXT NOT NULL)");
 database.prepare("INSERT INTO operational_recovery_checkpoints VALUES('journal','exporting','synthetic_segmented',0,'zero',?)").run(expires);database.exec('BEGIN');
 const insert=database.prepare('INSERT INTO answers VALUES(?,?)');for(let i=0;i<count;i++)insert.run(i,'synthetic');database.exec('COMMIT');
 const db={query:async(s,p=[])=>database.prepare(s).all(...p)};
 const custody={get:async name=>files.get(name)||null,put:async(name,bytes)=>{if(files.has(name))assert.deepEqual(files.get(name),bytes);files.set(name,bytes);return recoveryHash(bytes);}};
 return {database,db,custody,files,key,head:{state:'exporting',manifest_hash:'synthetic_segmented',sequence:0,head_hash:'zero',expires_at:expires}};
}
test('more than fifty thousand rows capture in bounded resumable steps with no duplicate pages or premature access',async()=>{
 const f=fixture();try{
  let previous=null,steps=0,done=false,lastInput;
  while(!done){lastInput=previous;const result=await segmentedSnapshot(f.db,f.custody,f.key)(f.head,previous);
   assert.ok(result.pages<=25);assert.equal(result.runtimeAccess,'blocked_pending_verified_boundary');
   if(steps===4){const retry=await segmentedSnapshot(f.db,f.custody,f.key)(f.head,previous);assert.deepEqual(retry,result);}
   previous=result.pointer;done=result.complete;steps++;
  }
  assert.ok(steps>40);
  let pointer=previous,rows=0;const seen=new Set();
  while(pointer){const segment=decryptRecord(f.files.get(pointer.name),f.key,pointer.name);
   for(const file of segment.files){assert.ok(!seen.has(file.name));seen.add(file.name);const page=decryptRecord(f.files.get(file.name),f.key,file.name);rows+=page.rows.length;}
   pointer=segment.previous;
  }
  assert.equal(rows,51003);assert.equal(f.database.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='journal'").get().state,'exporting');
  let streamed=0;for await(const item of segmentedSnapshotPages(f.custody,f.key,previous)){assert.equal(item.runtimeAccess,'blocked_pending_verified_boundary');if(item.kind==='page')streamed+=item.rows.length;}
  assert.equal(streamed,51003);
  const missing=[...f.files.keys()].find(name=>name.includes('.t0.p100.'));const saved=f.files.get(missing);f.files.delete(missing);
  await assert.rejects(async()=>{for await(const item of segmentedSnapshotPages(f.custody,f.key,previous))assert.equal(item.runtimeAccess,'blocked_pending_verified_boundary');},/invalid/);
  f.files.set(missing,saved);
  await assert.rejects(async()=>{for await(const item of segmentedSnapshotPages(f.custody,f.key,previous,{now:()=>f.head.expires_at}))assert.equal(item.runtimeAccess,'blocked_pending_verified_boundary');},/invalid/);
  await assert.rejects(segmentedSnapshot(f.db,f.custody,f.key,{now:()=>f.head.expires_at})(f.head,lastInput),/invalid/);
  assert.deepEqual(await segmentedSnapshot(f.db,f.custody,f.key)(f.head,lastInput),{pointer:previous,complete:true,pages:21,runtimeAccess:'blocked_pending_verified_boundary'});
  await assert.rejects(segmentedSnapshot(f.db,f.custody,f.key)(f.head,previous),/invalid/);
 }finally{f.database.close();}
});
test('interrupted upload retries immutable pages, changed fence and corrupted progress fail closed',async()=>{
 const f=fixture(103);try{
  let calls=0;const broken={...f.custody,put:async(...args)=>{const result=await f.custody.put(...args);if(++calls===2)throw Error('synthetic_upload_interruption');return result;}};
  await assert.rejects(segmentedSnapshot(f.db,broken,f.key,{pagesPerStep:1})(f.head));
  const first=await segmentedSnapshot(f.db,f.custody,f.key,{pagesPerStep:1})(f.head);
  await assert.rejects(segmentedSnapshot(f.db,f.custody,randomBytes(32),{pagesPerStep:1})(f.head,first.pointer));
  await assert.rejects(segmentedSnapshot(f.db,f.custody,f.key,{pagesPerStep:1})(f.head,{...first.pointer,sha256:'a'.repeat(64)}),/invalid/);
  f.database.exec("UPDATE operational_recovery_checkpoints SET head_hash='changed'");
  await assert.rejects(segmentedSnapshot(f.db,f.custody,f.key,{pagesPerStep:1})(f.head,first.pointer),/invalid/);
 }finally{f.database.close();}
});
