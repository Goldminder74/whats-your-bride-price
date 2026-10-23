import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {randomBytes} from 'node:crypto';
import {populatedRecoveryFixture} from '../helpers/populatedRecovery.mjs';
import {loadMigrationPlan,applyMigrationPlan} from '../../scripts/data-migrations.mjs';
import {D1Authority,createOperationId} from '../../scripts/authority-runtime.mjs';
import {boundedAuthorityStep} from '../../worker/boundedAuthority.mjs';
import {prepareAuthorityRestore} from '../../scripts/authority-restore-plan.mjs';
import {importProductionRestore,verifyProductionRestoreStep} from '../../scripts/streamed-d1-restore.mjs';
import {recoveryHash,encryptRecord} from '../../scripts/recovery-crypto.mjs';
const adapter=sql=>({query:async(s,p=[])=>sql.prepare(s).all(...p),batch:async rows=>{sql.exec('BEGIN');try{const result=rows.map(r=>sql.prepare(r.sql).all(...(r.params||[])));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}});
test('independent populated boundary feeds a provenance-pinned production import without reopening wallets or deletion-suppressed results',async()=>{
 const c=await populatedRecoveryFixture(),scratch=new DatabaseSync(':memory:'),journal=new DatabaseSync(':memory:'),target=new DatabaseSync(':memory:'),unused=new DatabaseSync(':memory:');
 const at=Date.now(),key=randomBytes(32),files=new Map(),clocks=new Map(),ids=new Map(),db=adapter(c.database);
 const custody={folderId:'synthetic_production_custody',index:{get:async n=>ids.get(n)||null,recoveryRecord:async n=>clocks.get(n),activeCount:async time=>[...clocks.values()].filter(c=>c.expiresAt>time).length},
  get:async n=>files.get(n)||null,put:async(n,b,clock)=>{if(files.has(n))assert.deepEqual(files.get(n),b);else{ids.set(n,'synthetic_file_'+ids.size);clocks.set(n,clock||{createdAt:at,expiresAt:at+2592000000});}files.set(n,b);return recoveryHash(b);},
  auditPage:async({cursor,pageSize})=>{const names=[...files.keys()].sort(),offset=Number(cursor||0);return {files:names.slice(offset,offset+pageSize).map(name=>({name,id:ids.get(name),mimeType:'application/octet-stream',parents:[custody.folderId],appProperties:{wybpRecovery:'1'}})),cursor:offset+pageSize<names.length?String(offset+pageSize):null};},
 };
 try{
  const migrations=await loadMigrationPlan();applyMigrationPlan(journal,migrations);applyMigrationPlan(target,migrations);
  const authority=new D1Authority(db,custody,key,{now:()=>at});await authority.initialise();
  let boundary,progress=null,calls=0;do{boundary=await boundedAuthorityStep(db,custody,key,'synthetic_populated',progress,{now:()=>at});progress=boundary.progress;assert.ok(++calls<100);}while(!boundary.complete);
  const pointer={name:'synthetic_populated.boundary',sha256:boundary.receipt};
  const prepared=await prepareAuthorityRestore({checkpointDatabase:adapter(journal),sourceDatabase:scratch,custody,key,boundary:pointer,id:'synthetic_production_restore',now:()=>at});
  assert.equal(prepared.runtimeAccess,'blocked_pending_verified_import_and_latest_authority');
  const options={role:'production-ops',databaseName:'wybp-prod-d1-r001',databaseId:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9',boundarySha256:pointer.sha256,snapshotSha256:prepared.provenance.snapshotSha256,job:'recovery_populated_synthetic',maxPages:2,now:at};
  let imported;do{imported=await importProductionRestore(adapter(target),custody,key,prepared.plan,options);assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);assert.ok(++calls<200);}while(!imported.imported);
  let verified;do{verified=await verifyProductionRestoreStep(adapter(target),custody,key,prepared.plan,options);assert.ok(++calls<300);}while(!verified.verified);
  for(const table of ['cowrie_wallets','cowrie_ledger','commerce_orders','retention_holds','retention_closures','retention_suppression','results'])assert.deepEqual(target.prepare('SELECT * FROM '+table+' ORDER BY 1').all(),c.database.prepare('SELECT * FROM '+table+' ORDER BY 1').all());
  assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);assert.deepEqual(target.prepare('PRAGMA foreign_key_check').all(),[]);
  const op=createOperationId(at),event={operationId:op,sequence:1,previousHash:'0'.repeat(64),intentHash:'a'.repeat(64),statements:[],createdAt:at,expiresAt:at+2592000000};await custody.put(op+'.intent',encryptRecord(event,key,op+'.intent'));
  await assert.rejects(prepareAuthorityRestore({checkpointDatabase:adapter(journal),sourceDatabase:unused,custody,key,boundary:pointer,id:'synthetic_stale',now:()=>at}));
  assert.equal(unused.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE type='table'").get().n,0,'later unresolved authority blocks even offline materialisation');
 }finally{c.database.close();scratch.close();journal.close();target.close();unused.close();}
});
