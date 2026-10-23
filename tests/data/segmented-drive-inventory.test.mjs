import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {capturePinnedInventory,recoverPinnedInventory,readPinnedInventoryFile,recoverProductionPinnedInventory} from '../../scripts/segmented-drive-inventory.mjs';
import {D1DriveIndex} from '../../scripts/d1-drive-index.mjs';
import {DriveCustody} from '../../scripts/drive-custody.mjs';
import {loadMigrationPlan,applyMigrationPlan} from '../../scripts/data-migrations.mjs';
import {encryptRecord,recoveryHash} from '../../scripts/recovery-crypto.mjs';
const resource={name:'wybp-capacity-d1-r002',id:'11111111-1111-4111-8111-111111111111',account:'b6b22a9a87b5758725e5c499782160af'};
for(const production of [false,true])test('all file IDs reconstruct from independent root after total index loss and interrupted mapping delivery: '+(production?'production guard':'isolated guard'),async()=>{
 const sql=new DatabaseSync(':memory:'),journal=new DatabaseSync(':memory:'),key=randomBytes(32),provider=new Map();let serial=0;
 applyMigrationPlan(sql,await loadMigrationPlan());
 const db={query:async(s,p=[])=>sql.prepare(s).all(...p),batch:async rows=>{sql.exec('BEGIN');try{const result=rows.map(r=>sql.prepare(r.sql).all(...r.params));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const fetcher=async input=>{
  const url=new URL(input),id=url.pathname.split('/').at(-1),file=provider.get(id);
  if(!file)return new Response(null,{status:404});
  return url.searchParams.has('alt')?new Response(file.bytes):Response.json({id,name:file.name,parents:[file.folderId],trashed:false});
 };
 const custodies=Array.from({length:3},(_,i)=>{
  const folderId='synthetic_folder_'+i,index=new D1DriveIndex(db,folderId),c=new DriveCustody({folderId,index,accessToken:async()=> 'synthetic-token',fetcher});
  c.put=async(name,bytes,retention)=>{const proposed=await index.get(name)||'synthetic_file_'+serial++;const id=retention?await index.recoverReserve(name,proposed,retention):await index.reserve(name,proposed);if(provider.has(id))assert.deepEqual(provider.get(id).bytes,bytes);else provider.set(id,{name,folderId,bytes});return recoveryHash(bytes);};return c;
 });
 const records=[];
 try{
  for(let i=0;i<210;i++){const c=custodies[1+i%2],name='synthetic_record_'+i+'.enc',bytes=encryptRecord({synthetic:i},key,name);await c.put(name,bytes);records.push({name,id:await c.index.get(name),folderId:c.folderId,sha256:recoveryHash(bytes),...await c.index.recoveryRecord(name)});}
  let frozenChecks=0;
  const options={root:custodies[0],key,id:'synthetic_inventory',records,expectedCount:records.length,journal,assertFrozen:async()=>{frozenChecks++;return 'a'.repeat(64);}};
  await assert.rejects(capturePinnedInventory({...options,fault:()=>{throw Error('synthetic_capture_crash');}}),/synthetic_capture_crash/);
  const pointer=await capturePinnedInventory(options);assert.ok(frozenChecks>210);
  await assert.rejects(capturePinnedInventory({...options,journal:sql}),/unavailable/);
  await assert.rejects(capturePinnedInventory({...options,assertFrozen:async()=> 'b'.repeat(64)}),/unavailable/);
  const originalClocks=sql.prepare("SELECT id,created_at,expires_at FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%' ORDER BY id").all();
  sql.exec("DELETE FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%'");
  assert.equal(await custodies[0].index.get(pointer.name),null);
  assert.equal((await readPinnedInventoryFile(custodies,key,pointer)).count,210);
  const recovery={db,custodies,key,pointer,resource,job:production?'recovery_lost_index':'synthetic_lost_index',maxFiles:25,...(production?{role:'production-ops',databaseName:'wybp-prod-d1-r001',databaseId:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'}:{})},recover=production?recoverProductionPinnedInventory:recoverPinnedInventory;
  if(production){await assert.rejects(recover({...recovery,role:'production-app'}));await assert.rejects(recover({...recovery,databaseId:resource.id}));}
  await assert.rejects(recover({...recovery,fault:(_stage,cursor)=>{if(cursor===2)throw Error('synthetic_mapping_crash');}}),/synthetic_mapping_crash/);
  assert.equal(sql.prepare('SELECT cursor FROM operational_recovery_checkpoints WHERE id=?').get(recovery.job).cursor,2);
  let restored;do{restored=await recover(recovery);assert.equal(restored.runtimeAccess,'blocked_pending_authority_suppression_receipt');}while(!restored.verified);
  assert.equal(restored.files,210);
  assert.deepEqual(sql.prepare("SELECT id,created_at,expires_at FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%' ORDER BY id").all(),originalClocks);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
  for(const record of records)assert.equal(await custodies.find(c=>c.folderId===record.folderId).index.get(record.name),record.id);
  await assert.rejects(capturePinnedInventory({...options,id:'synthetic_missing',records:records.slice(1)}),/unavailable/);
  await assert.rejects(capturePinnedInventory({...options,id:'synthetic_duplicate',records:[records[0],records[0]],expectedCount:2}),/unavailable/);
  await assert.rejects(readPinnedInventoryFile(custodies,randomBytes(32),pointer));
  await assert.rejects(readPinnedInventoryFile(custodies,key,{...pointer,folderId:'outside_folder_001'}),/unavailable/);
  await assert.rejects(readPinnedInventoryFile(custodies,key,pointer,pointer.expiresAt),/unavailable/);
 }finally{sql.close();journal.close();}
});
