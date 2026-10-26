// Synthetic, local-only physical stock rehearsal. No credentials or hosted client.
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,statSync,statfsSync,unlinkSync,realpathSync} from 'node:fs';
import {join,resolve,relative,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {populatedRecoveryFixture} from './populatedRecovery.mjs';
import {loadMigrationPlan,applyMigrationPlan} from '../../scripts/data-migrations.mjs';
import {D1Authority,createOperationId} from '../../scripts/authority-runtime.mjs';
import {createAuthorityService} from '../../worker/authorityService.mjs';
import {D1DriveIndex} from '../../scripts/d1-drive-index.mjs';
import {DriveCustody} from '../../scripts/drive-custody.mjs';
import {capturePinnedInventory,recoverProductionPinnedInventory} from '../../scripts/segmented-drive-inventory.mjs';
import {prepareAuthorityRestore} from '../../scripts/authority-restore-plan.mjs';
import {importProductionRestore,verifyProductionRestoreStep} from '../../scripts/streamed-d1-restore.mjs';
import {recoveryHash,decryptRecord} from '../../scripts/recovery-crypto.mjs';
const DAY=86400000;
const adapter=sql=>({query:async(s,p=[])=>sql.prepare(s).all(...p),batch:async rows=>{sql.exec('BEGIN');try{const result=rows.map(r=>sql.prepare(r.sql).all(...(r.params||[])));sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}});
const digestTable=(sql,table)=>{const h=createHash('sha256');for(const row of sql.prepare('SELECT * FROM '+table+' ORDER BY 1').iterate())h.update(JSON.stringify(row)+'\n');return h.digest('hex');};

export async function localStockRecovery({games=30,profile='sample',progress=()=>{},preparedPath}={}){
 const prepared99=profile==='retained-99d-prepared',retained=profile==='retained-90d'||prepared99;
 if(!['sample','retained-90d','retained-99d-prepared'].includes(profile)||!Number.isSafeInteger(games)||games<1||(retained?games!==(prepared99?495000:450000):games>45000)||typeof progress!=='function')throw Error('local_stock_scope');
 const space=()=>{const s=statfsSync(tmpdir());return Number(s.bavail)*Number(s.bsize);};
 if(retained&&space()<(prepared99?7000000000:12000000000))throw Error('local_stock_disk_headroom');
 const parent=resolve(tmpdir()),directory=mkdtempSync(join(parent,'wybp-local-schema-stock-')),key=randomBytes(32),at=Date.now(),started=performance.now();
 const inside=relative(parent,resolve(directory));if(!inside||inside.startsWith('..'+sep)||inside==='..'||!inside.startsWith('wybp-local-schema-stock-'))throw Error('local_cleanup_scope');
 let source,scratch,journal,target,provider,inventoryJournal,context;
 const report={engine:'local SQLite and synthetic disk custody; no hosted operations',profile,games,answers:games*12,hostedRequests:0,sourceIndexLossVerified:false,importInterruptedAndResumed:false,runtimeAccess:'blocked_pending_latest_authority_and_suppression',qualification:retained?'Physical90-day completed-game stock, independent synthetic wallet identities and varied hashes/clocks, plus protected accounting examples. Excludes7-day purge grace,48h backlog, incomplete-game stock, long-lived financial/hold stock and30-day authority inventory; not hosted RTO.':'Physical gaming-row lower bound plus existing protected accounting examples. One historical wallet; not unique-player capacity, full90-day attempt/answer/result stock, long-lived financial stock,30-day authority-object inventory or hosted RTO.'};
 try{
  if(prepared99){const root=realpathSync(resolve('outputs/retained-stock'))+sep,path=realpathSync(preparedPath);if(!path.startsWith(root)||!path.endsWith(sep+'source.sqlite'))throw Error('prepared_fixture_scope');source=new DatabaseSync(path,{enableForeignKeyConstraints:true});}
  else{context=await populatedRecoveryFixture();await backup(context.database,join(directory,'source.sqlite'));context.database.close();context=null;source=new DatabaseSync(join(directory,'source.sqlite'),{enableForeignKeyConstraints:true});}const db=adapter(source),migrations=await loadMigrationPlan();
  scratch=new DatabaseSync(join(directory,'materialised.sqlite'));journal=new DatabaseSync(join(directory,'verification.sqlite'));target=prepared99?null:new DatabaseSync(join(directory,'target.sqlite'),{enableForeignKeyConstraints:true});inventoryJournal=new DatabaseSync(':memory:');
  applyMigrationPlan(journal,migrations);if(target)applyMigrationPlan(target,migrations);
  const attempt={...source.prepare('SELECT * FROM quiz_attempts LIMIT 1').get()},result={...source.prepare('SELECT * FROM results LIMIT 1').get()},answers=source.prepare('SELECT * FROM answers WHERE attempt_id=? LIMIT 12').all(attempt.id);assert.equal(answers.length,12);
  const insert=(table,row)=>{const keys=Object.keys(row),s=source.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')');return v=>s.run(...keys.map(k=>v[k]));};
  const wallet={...source.prepare('SELECT * FROM cowrie_wallets LIMIT 1').get()},addWallet=insert('cowrie_wallets',wallet);
  const addAttempt=insert('quiz_attempts',attempt),addResult=insert('results',result),addAnswer=insert('answers',answers[0]);source.exec('BEGIN');
  try{for(let i=1;i<(prepared99?1:games);i++){const id='local_stock_attempt_'+i,entropy=retained?randomBytes(32).toString('hex'):i.toString(16).padStart(64,'0'),clock=at-(retained?i%90:0)*DAY;
   if(retained)addWallet({...wallet,id:'wallet_'+i.toString(16).padStart(32,'0'),public_reference:'cw_'+i.toString(16).padStart(32,'0'),anonymous_owner_hash:entropy,state:'active',purchased_balance:0,bonus_balance:0,free_quick_plays_consumed:1,recovery_credential_hash:randomBytes(32).toString('hex'),closed_at:null,ownership_minimized_at:null,retention_expires_at:null,deleted_at:null,frozen_at:null,created_at:clock,updated_at:clock});
   addAttempt({...attempt,id,idempotency_key_hash:entropy,...(retained?{anonymous_subject_hash:entropy,created_at:clock,updated_at:clock,started_at:clock,completed_at:clock,deleted_at:null,anonymized_at:null}: {})});addResult({...result,id:'local_stock_result_'+i,attempt_id:id,public_slug:retained?randomBytes(24).toString('hex'):i.toString(16).padStart(48,'0'),...(retained?{created_at:clock,updated_at:clock,deleted_at:null,anonymized_at:null}: {})});for(const[j,row]of answers.entries())addAnswer({...row,id:'local_stock_answer_'+i+'_'+j,attempt_id:id,...(retained?{answered_at:clock,created_at:clock,updated_at:clock}: {})});
   if(retained&&i%10000===0&&space()<3500000000)throw Error('local_stock_disk_stop');
  }source.exec('COMMIT');}catch(error){source.exec('ROLLBACK');throw error;}
  assert.deepEqual(source.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(source.prepare('SELECT COUNT(*) n FROM answers').get().n,games*12+(prepared99?12:0));progress('physical-stock-seeded');
  report.sourceBytes=statSync(prepared99?preparedPath:join(directory,'source.sqlite')).size;
  provider=new DatabaseSync(join(directory,'provider.sqlite'));provider.exec("CREATE TABLE files(serial INTEGER PRIMARY KEY,id TEXT UNIQUE,name TEXT UNIQUE,sha256 TEXT,created INTEGER,expires INTEGER,properties TEXT DEFAULT '{\"wybpRecovery\":\"1\"}')");mkdirSync(join(directory,'ciphertext'));
  const folderId='synthetic_local_stock_folder';let index=new D1DriveIndex(db,folderId,{now:()=>at});let reads=0,writes=0,transfer=0,metadataUpdates=0;
  const custody=new DriveCustody({folderId,index,accessToken:async()=> 'synthetic-local-only',fetcher:async(input,options={})=>{
   const u=new URL(input);assert.equal(u.origin,'https://www.googleapis.com');const id=u.pathname.split('/').at(-1),file=provider.prepare('SELECT * FROM files WHERE id=?').get(id);
   if(!file)return new Response(null,{status:404});if(options.method==='PATCH'){const value=JSON.parse(options.body);assert.deepEqual(Object.keys(value),['appProperties']);assert.match(value.appProperties.wybpCommitProof,/^[a-f0-9]{64}$/);provider.prepare('UPDATE files SET properties=? WHERE id=?').run(JSON.stringify(value.appProperties),id);metadataUpdates++;return Response.json({id});}assert.ok(!options.method||options.method==='GET');reads++;
   if(!u.searchParams.has('alt'))return Response.json({id,name:file.name,parents:[folderId],trashed:false,appProperties:JSON.parse(file.properties)});const bytes=readFileSync(join(directory,'ciphertext',id));transfer+=bytes.length;return new Response(bytes);
  }});
  custody.get=async name=>{reads++;const id=await index.get(name);if(!id)return null;const file=provider.prepare('SELECT * FROM files WHERE id=?').get(id);if(!file)return null;const bytes=readFileSync(join(directory,'ciphertext',id));transfer+=bytes.length;return bytes;};
  custody.put=async(name,bytes,clock={createdAt:at,expiresAt:at+30*DAY})=>{custody.name(name);const id=await index.recoverReserve(name,'synthetic_file_'+recoveryHash(Buffer.from(name)),clock),old=provider.prepare('SELECT * FROM files WHERE id=?').get(id),sha256=recoveryHash(bytes);if(old)assert.equal(old.sha256,sha256);else{writeFileSync(join(directory,'ciphertext',id),bytes);provider.prepare('INSERT INTO files(id,name,sha256,created,expires) VALUES(?,?,?,?,?)').run(id,name,sha256,clock.createdAt,clock.expiresAt);writes++;transfer+=bytes.length;}return sha256;};
  custody.auditPage=async({cursor,pageSize})=>{reads++;const offset=Number(cursor||0),rows=provider.prepare('SELECT * FROM files ORDER BY name LIMIT ? OFFSET ?').all(pageSize,offset),count=provider.prepare('SELECT COUNT(*) n FROM files').get().n;return {files:rows.map(f=>({id:f.id,name:f.name,mimeType:'application/octet-stream',parents:[folderId],appProperties:{wybpRecovery:'1'}})),cursor:offset+rows.length<count?String(offset+rows.length):null};};
  const authority=new D1Authority(db,custody,key,{now:()=>at});await authority.initialise();await authority.mutate(createOperationId(at),[{sql:'UPDATE quiz_attempts SET id=id WHERE id=?1',params:[attempt.id]}]);
  const service=()=>createAuthorityService({db,custody,key,now:()=>at,alert:async()=>{},snapshot:async()=>assert.fail('monolithic capture forbidden')});let captured,calls=0;
  const captureLimit=retained?15000:5000,cleanupLimit=retained?22000:7000;
  do{captured=await service().advanceSnapshot('synthetic_local_stock');assert.ok(++calls<captureLimit);if(calls%100===0){progress('bounded-capture-step-'+calls);if(retained&&space()<3500000000)throw Error('local_stock_disk_stop');}}while(!captured.complete);report.captureCalls=calls;
  let compacted;do{compacted=await service().cleanupSnapshotStep('synthetic_local_stock');assert.ok(++calls<cleanupLimit);}while(!compacted.complete);progress('bounded-boundary-verified');
  const boundary={name:'synthetic_local_stock.boundary',sha256:captured.receipt},frozen=await authority.freeze('synthetic_inventory_fence'),fence=recoveryHash(Buffer.from(JSON.stringify([frozen.manifest_hash,frozen.sequence,frozen.head_hash]))),watermark=provider.prepare('SELECT MAX(serial) n FROM files').get().n;
  const inventoryRecords=async function*(){for(const row of provider.prepare('SELECT * FROM files WHERE serial<=? ORDER BY name').iterate(watermark))yield {name:row.name,id:row.id,folderId,sha256:row.sha256,createdAt:row.created,expiresAt:row.expires};};
  const pointer=await capturePinnedInventory({root:custody,key,id:'synthetic_stock_index',records:inventoryRecords(),expectedCount:watermark,journal:inventoryJournal,now:at,assertFrozen:async()=>{const h=await authority.head();assert.equal(h.state,'exporting');return recoveryHash(Buffer.from(JSON.stringify([h.manifest_hash,h.sequence,h.head_hash])));}});
  report.snapshotObjects=watermark;report.snapshotCiphertextBytes=0;for(const row of provider.prepare('SELECT id FROM files WHERE serial<=?').iterate(watermark))report.snapshotCiphertextBytes+=statSync(join(directory,'ciphertext',row.id)).size;
  source.exec("DELETE FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%'");assert.equal(await index.get(boundary.name),null);
  const recovery={db,custodies:[custody],key,pointer,job:'recovery_local_stock_index',maxFiles:25,now:at,role:'production-ops',databaseName:'wybp-prod-d1-r001',databaseId:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'};
  await assert.rejects(recoverProductionPinnedInventory({...recovery,fault:(_stage,cursor)=>{if(cursor===2)throw Error('synthetic_index_interrupt');}}),/synthetic_index_interrupt/);let restoredIndex;do{restoredIndex=await recoverProductionPinnedInventory(recovery);assert.equal(source.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);}while(!restoredIndex.verified);
  for await(const file of inventoryRecords()){assert.equal(await index.get(file.name),file.id);assert.deepEqual(await index.recoveryRecord(file.name),{createdAt:file.createdAt,expiresAt:file.expiresAt});}report.sourceIndexLossVerified=true;progress('complete-index-reconstructed');
  const prepared=await prepareAuthorityRestore({checkpointDatabase:adapter(journal),sourceDatabase:scratch,custody,key,boundary,id:'synthetic_local_restore',now:()=>at}),options={role:'production-ops',databaseName:'wybp-prod-d1-r001',databaseId:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9',boundarySha256:boundary.sha256,snapshotSha256:prepared.provenance.snapshotSha256,job:'recovery_local_stock',maxPages:25,now:at};
  const manifest=decryptRecord(await custody.get(prepared.plan.name),key,prepared.plan.name);report.restorePageSize=manifest.pageSize;assert.equal(manifest.pageSize,50);assert.ok(manifest.pages<=250000);
  const comparedTables=['quiz_attempts','answers','results','cowrie_wallets','cowrie_ledger','commerce_orders','retention_holds','retention_closures','retention_suppression'],expected=prepared99?new Map(comparedTables.map(t=>[t,digestTable(source,t)])):null;
  if(prepared99){
   // Reuse one disk slot for materialisation and import. Only this invocation's
   // generated scratch file is removed, after its authenticated plan is complete.
   scratch.close();scratch=null;const stagePath=resolve(directory,'materialised.sqlite');if(!stagePath.startsWith(resolve(directory)+sep))throw Error('local_cleanup_scope');unlinkSync(stagePath);
   target=new DatabaseSync(stagePath,{enableForeignKeyConstraints:true});target.exec('PRAGMA busy_timeout=5000');applyMigrationPlan(target,migrations);
   index=new D1DriveIndex(adapter(journal),folderId,{now:()=>at});for(const row of provider.prepare('SELECT * FROM files ORDER BY serial').iterate())await index.recoverReserve(row.name,row.id,{createdAt:row.created,expiresAt:row.expires});
   source.close();source=null;report.sourceUnavailableDuringImport=true;progress('source-closed-before-import');
  }
  await assert.rejects(importProductionRestore(adapter(target),custody,key,prepared.plan,{...options,fault:(_stage,cursor)=>{if(cursor===2)throw Error('synthetic_import_interrupt');}}),/synthetic_import_interrupt/);let imported,importCalls=0;
  do{imported=await importProductionRestore(adapter(target),custody,key,prepared.plan,options);assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);assert.ok(++importCalls<10000);if(importCalls%100===0)progress('imported-pages-'+imported.cursor);}while(!imported.imported);report.importInterruptedAndResumed=true;report.importCalls=importCalls;progress('interrupted-import-resumed');
  let checked,verifyCalls=0;do{checked=await verifyProductionRestoreStep(adapter(target),custody,key,prepared.plan,options);assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);assert.ok(++verifyCalls<10000);}while(!checked.verified);report.verifyCalls=verifyCalls;
  for(const table of comparedTables)assert.equal(digestTable(target,table),prepared99?expected.get(table):digestTable(source,table),table+' must match exactly');assert.deepEqual(target.prepare('PRAGMA foreign_key_check').all(),[]);
  report.accountingHoldsClosuresSuppressionVerified=true;report.verifiedAnswerRows=target.prepare('SELECT COUNT(*) n FROM answers').get().n;report.localCustodyReadActions=reads;report.localCiphertextWrites=writes;report.localCommitMetadataUpdates=metadataUpdates;report.localTransferredBytes=transfer;report.elapsedMs=Math.round(performance.now()-started);report.boundarySha256=boundary.sha256;report.totalArchiveObjects=provider.prepare('SELECT COUNT(*) n FROM files').get().n;report.allCiphertextBytes=0;for(const row of provider.prepare('SELECT id FROM files').iterate())report.allCiphertextBytes+=statSync(join(directory,'ciphertext',row.id)).size;
  if(!prepared99){const finalHead=await authority.head();assert.equal(finalHead.state,'exporting');assert.equal(fence,recoveryHash(Buffer.from(JSON.stringify([finalHead.manifest_hash,finalHead.sequence,finalHead.head_hash]))));}else report.qualification='Physical99-day gameplay plus21,500 incomplete attempts and550,000 wallets, real expiry/purge-grace/48h backlog, protected accounting examples. Initial offline capture is frozen; concurrent mirror availability is separate evidence. No30-day archive pressure, hosted measurement or RTO claim.';return report;
 }finally{
  context?.database.close();for(const sql of [source,scratch,journal,target,provider,inventoryJournal])sql?.close();key.fill(0);
  rmSync(directory,{recursive:true,force:true});
 }
}
