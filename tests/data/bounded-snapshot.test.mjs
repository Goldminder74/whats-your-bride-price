import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {boundedSnapshotStep} from '../../worker/boundedSnapshot.mjs';
import {materializeSegmentedSnapshot} from '../../scripts/worker-snapshot-restore.mjs';
import {recoveryHash,decryptRecord} from '../../scripts/recovery-crypto.mjs';
function fixture(count=1800000){
 const sql=new DatabaseSync(':memory:'),key=randomBytes(32),files=new Map(),at=Date.now();let reads=0;
 sql.exec("CREATE TABLE operational_recovery_checkpoints(id TEXT PRIMARY KEY,state TEXT,manifest_hash TEXT,sequence INTEGER,head_hash TEXT,expires_at INTEGER);CREATE TABLE answers(id INTEGER PRIMARY KEY,value TEXT NOT NULL)");
 sql.prepare("INSERT INTO operational_recovery_checkpoints VALUES('journal','exporting','synthetic_bounded',0,'zero',?)").run(at+3600000);
 sql.exec('BEGIN');const insert=sql.prepare('INSERT INTO answers VALUES(?,?)');for(let i=0;i<count;i++)insert.run(i,'synthetic');sql.exec('COMMIT');
 const head=sql.prepare("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'").get();
 const db={query:async(s,p=[])=>sql.prepare(s).all(...p)},custody={get:async name=>{reads++;return files.get(name)||null;},put:async(name,bytes)=>{if(files.has(name))assert.deepEqual(files.get(name),bytes);files.set(name,bytes);return recoveryHash(bytes);}};
 return {sql,db,custody,key,files,head,reads:()=>reads};
}
test('full-stock capture and independent verification advance by bounded segments with interrupted progress and no premature access',async()=>{
 const f=fixture(),target=new DatabaseSync(':memory:');try{
  let progress=null,result,calls=0;
  do{
   const before=f.reads(),prior=progress;result=await boundedSnapshotStep(f.db,f.custody,f.key,f.head,progress);progress=result.progress;
   assert.ok(f.reads()-before<=12);assert.equal(result.runtimeAccess,'blocked_pending_authority_verification');assert.equal(f.sql.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='journal'").get().state,'exporting');
   if(calls===2){const retry=await boundedSnapshotStep(f.db,f.custody,f.key,f.head,prior);assert.deepEqual(retry.snapshot,result.snapshot);assert.equal(retry.complete,result.complete);}
   assert.ok(++calls<3000);
  }while(!result.complete);
  assert.equal(calls,2880);const proof=decryptRecord(f.files.get(result.proof.name),f.key,result.proof.name);assert.equal(proof.counts.answers,1800000);assert.equal(proof.checkedSegments,1440);
  const restored=await materializeSegmentedSnapshot(f.custody,f.key,result.snapshot,target);assert.equal(restored.rows,1800000);assert.equal(target.prepare('SELECT COUNT(*) n FROM answers').get().n,1800000);
  assert.equal(restored.runtimeAccess,'blocked_pending_fresh_receipt');
  await assert.rejects(boundedSnapshotStep(f.db,f.custody,randomBytes(32),f.head,progress));
 }finally{target.close();f.sql.close();}
});
test('missing segments, changed fences and expiry cannot produce a verified proof',async()=>{
 for(const cause of ['missing','fence','expiry']){
  const f=fixture(1300);try{
   let result=await boundedSnapshotStep(f.db,f.custody,f.key,f.head);while(!result.complete&&decryptRecord(Buffer.from(result.progress,'base64'),f.key,'synthetic_bounded.bounded-progress').phase==='capture')result=await boundedSnapshotStep(f.db,f.custody,f.key,f.head,result.progress);
   if(cause==='missing')f.files.delete(result.snapshot.name);
   if(cause==='fence')f.sql.exec("UPDATE operational_recovery_checkpoints SET head_hash='changed'");
   await assert.rejects(boundedSnapshotStep(f.db,f.custody,f.key,f.head,result.progress,cause==='expiry'?{now:()=>f.head.expires_at}:{}));
   assert.equal(f.files.has('synthetic_bounded.snapshot-proof.enc'),false);
  }finally{f.sql.close();}
 }
});
