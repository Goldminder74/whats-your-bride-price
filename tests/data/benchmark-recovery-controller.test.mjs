import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {populatedRecoveryFixture} from '../helpers/populatedRecovery.mjs';
import {runBenchmarkRecovery} from '../../scripts/benchmark-recovery-controller.mjs';
import {segmentedSnapshot} from '../../worker/segmentedSnapshot.mjs';
import {D1Authority} from '../../scripts/authority-runtime.mjs';
import {D1DriveIndex} from '../../scripts/d1-drive-index.mjs';
import {DriveCustody} from '../../scripts/drive-custody.mjs';
import {recoverPinnedInventory} from '../../scripts/segmented-drive-inventory.mjs';
import {importStreamedRestore,verifyStreamedRestoreStep,auditStreamedSourceStep,clearAuditedSyntheticTarget} from '../../scripts/streamed-d1-restore.mjs';
import {recoveryHash} from '../../scripts/recovery-crypto.mjs';
const resource={name:'wybp-capacity-d1-r002',id:'11111111-1111-4111-8111-111111111111',account:'b6b22a9a87b5758725e5c499782160af'};
test('integrated controller resumes populated restore and complete lost-index recovery without granting access',async()=>{
 const c=await populatedRecoveryFixture(),key=randomBytes(32),directory=await mkdtemp(join(tmpdir(),'synthetic-controller-')),provider=new Map(),receipts=new Map();let next=0,removed=false;
 const sql=c.database,db={query:async(s,p=[])=>sql.prepare(s).all(...p),batch:async statements=>{sql.exec('BEGIN');try{const r=statements.map(s=>sql.prepare(s.sql).all(...(s.params||[])));sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const fetcher=async input=>{const url=new URL(input),id=url.pathname.split('/').at(-1),file=provider.get(id);if(!file)return new Response(null,{status:404});return url.searchParams.has('alt')?new Response(file.bytes):Response.json({id,name:file.name,parents:[file.folderId],trashed:false});};
 const all=Array.from({length:17},(_,i)=>{const folderId='synthetic_controller_folder_'+i,index=new D1DriveIndex(db,folderId),custody=new DriveCustody({folderId,index,fetcher,accessToken:async()=> 'synthetic-token'});
  custody.put=async(name,bytes,retention)=>{const proposed=await index.get(name)||'synthetic_controller_file_'+next++,id=retention?await index.recoverReserve(name,proposed,retention):await index.reserve(name,proposed);if(provider.has(id))assert.deepEqual(provider.get(id).bytes,bytes);else provider.set(id,{name,folderId,bytes});return recoveryHash(bytes);};return custody;});
 const choose=name=>name.includes('.inventory.')?all[0]:all[1];
 const custody={get:async name=>choose(name).get(name),put:async(name,bytes,retention)=>choose(name).put(name,bytes,retention)};
 const authority=new D1Authority(db,custody,key);await authority.initialise();
 const frozen=async()=>recoveryHash(Buffer.from(JSON.stringify(await authority.head())));
 const before=Object.fromEntries(['cowrie_wallets','cowrie_ledger','commerce_orders','stripe_webhook_events','retention_holds','retention_closures','retention_suppression'].map(table=>[table,sql.prepare('SELECT * FROM '+table+' ORDER BY 1').all()]));
 const action=async command=>{
  const old=receipts.get(command.id);if(old){assert.deepEqual(old.command,command);return old.result;}
  let result;
  switch(command.kind){
   case 'capture':result=await segmentedSnapshot(db,custody,key,{pagesPerStep:5})(await authority.freeze(command.captureId),command.previous);break;
   case 'custody-get':case 'root-get':{const bytes=await custody.get(command.name);result={ciphertext:bytes?bytes.toString('base64'):null};break;}
   case 'custody-put':case 'root-put':{const bytes=Buffer.from(command.ciphertext,'base64'),sha256=await custody.put(command.name,bytes,command.retention),target=choose(command.name);result={sha256,id:await target.index.get(command.name),...await target.index.recoveryRecord(command.name)};break;}
   case 'inspect-fence':result={fenceSha256:await frozen()};break;
   case 'inventory-info':result={count:provider.size,folders:all.map(x=>x.folderId)};break;
   case 'inventory-page':{const files=[];for(const [id,file] of provider){if(file.folderId!==command.folderId||file.name.includes(command.inventoryId+'.inventory.'))continue;files.push({id,name:file.name,folderId:file.folderId,sha256:recoveryHash(file.bytes),...await choose(file.name).index.recoveryRecord(file.name)});}files.sort((a,b)=>a.name.localeCompare(b.name));result={files,cursor:null};break;}
   case 'simulate-index-loss':assert.equal(removed,false);sql.exec("DELETE FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%'; DELETE FROM retention_restore");removed=true;result={runtimeAccess:'blocked'};break;
   case 'recover-index':result=await recoverPinnedInventory({db,custodies:all,key,pointer:command.pointer,resource,job:command.job,maxFiles:5});break;
   case 'restore-audit':result=await auditStreamedSourceStep(db,custody,key,command.pointer,{resource,job:command.job,assertFrozen:frozen,maxPages:5});break;
   case 'restore-clear':result=await clearAuditedSyntheticTarget(db,custody,key,command.pointer,{resource,job:command.job,assertFrozen:frozen});break;
   case 'restore-import':result=await importStreamedRestore(db,custody,key,command.pointer,{resource,job:command.job,maxPages:5});break;
   case 'restore-verify':result=await verifyStreamedRestoreStep(db,custody,key,command.pointer,{job:command.job,maxPages:5});break;
   default:assert.fail('Unexpected controller command');
  }
  receipts.set(command.id,{command,result});return result;
 };
 const options={action,key,directory,id:'synthetic_joined'};
 try{
  let lost=false;
  await assert.rejects(runBenchmarkRecovery({...options,action:async command=>{const result=await action(command);if(command.kind==='capture'&&!lost){lost=true;throw Error('synthetic_lost_capture_response');}return result;}}),/synthetic_lost_capture_response/);
  // The adapter's durable readback returns the same saved result for that action
  // ID. The controller does not change the command or blindly issue it anew.
  await assert.rejects(runBenchmarkRecovery({...options,fault:stage=>{if(stage==='index_removed')throw Error('synthetic_index_interruption');}}),/synthetic_index_interruption/);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%'").get().n,0);
  await assert.rejects(runBenchmarkRecovery({...options,fault:stage=>{if(stage==='source_cleared')throw Error('synthetic_clear_interruption');}}),/synthetic_clear_interruption/);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM cowrie_ledger').get().n,0);
  await assert.rejects(runBenchmarkRecovery({...options,fault:stage=>{if(stage==='import_resumed')throw Error('synthetic_import_interruption');}}),/synthetic_import_interruption/);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
  const result=await runBenchmarkRecovery(options);assert.equal(result.verified,true);assert.equal(result.runtimeAccess,'blocked_pending_authority_suppression_receipt');
  assert.deepEqual(await runBenchmarkRecovery(options),result);
  for(const [table,rows] of Object.entries(before))assert.deepEqual(sql.prepare('SELECT * FROM '+table+' ORDER BY 1').all(),rows);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
  assert.throws(()=>sql.exec("UPDATE cowrie_wallets SET state='active'"),/cannot reopen/);
  assert.throws(()=>sql.exec('UPDATE cowrie_wallets SET purchased_balance=99'),/cache mismatch/);
  await assert.rejects(runBenchmarkRecovery({...options,key:randomBytes(32)}));
 }finally{sql.close();await rm(directory,{recursive:true,force:true});}
});
