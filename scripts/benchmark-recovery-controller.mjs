// Local controller for the exact isolated recovery target. Every remote operation
// goes through the caller's durable admission journal; no unmetered provider I/O.
// This verifies restoration but deliberately grants no application access.
import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {encryptRecord,decryptRecord,recoveryHash} from './recovery-crypto.mjs';
import {materializeSegmentedSnapshot} from './worker-snapshot-restore.mjs';
import {prepareStreamedRestore} from './streamed-d1-restore.mjs';
import {capturePinnedInventory} from './segmented-drive-inventory.mjs';
import {privatePath} from './operational-backup.mjs';
const fail=()=>{throw Error('benchmark_recovery_controller_unavailable');};
export async function runBenchmarkRecovery({action,key,directory,id,now=Date.now,fault=()=>{}}){
 if(typeof action!=='function'||!Buffer.isBuffer(key)||key.length!==32||!/^synthetic_[a-zA-Z0-9_-]{1,35}$/.test(id||''))fail();
 const root=await privatePath(resolve(directory)),stateFile=join(root,id+'.controller.enc');await mkdir(root,{recursive:true});
 let state;
 try{state=decryptRecord(await readFile(stateFile),key,id);}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,id,step:0};}
 if(state.version!==1||state.id!==id)fail();
 const save=async()=>{const staging=stateFile+'.writing';await writeFile(staging,encryptRecord(state,key,id),{mode:0o600});await rename(staging,stateFile);};
 const call=async command=>{
  // The action implementation must retain known settlement receipts so a local
  // crash can read back rather than repeat a reserved or settled side effect.
  if(state.pending&&JSON.stringify(state.pending.command)!==JSON.stringify(command))fail();
  if(!state.pending){if((state.rpc||0)>=10000)fail();state.pending={command,id:id+'_rpc_'+(state.rpc||0)};state.rpc=(state.rpc||0)+1;await save();}
  const result=await action({...command,id:state.pending.id});
  if(!result||result.failed)fail();state.pending=null;await save();return result;
 };
 const custody={get:async name=>{const r=await call({kind:'custody-get',name});return r.ciphertext===null?null:Buffer.from(r.ciphertext,'base64');},
  put:async(name,bytes,retention)=>(await call({kind:'custody-put',name,ciphertext:Buffer.from(bytes).toString('base64'),retention})).sha256};
 if(state.step===0){
  while(!state.snapshot?.complete){const r=await call({kind:'capture',captureId:id+'_snapshot',previous:state.snapshot?.pointer||null});state.snapshot=r;await save();await fault('capture_checkpointed');}
  state.step=1;await save();
 }
 if(state.step===1){
  // Fresh in-memory materialisation cannot accidentally reuse a partially
  // written plaintext source after a crash. Only encrypted plans are persisted.
  const source=new DatabaseSync(':memory:');
  try{state.materialized=await materializeSegmentedSnapshot(custody,key,state.snapshot.pointer,source);
   const count=sql=>source.prepare(sql).get().n;
   const badBalances=count("SELECT COUNT(*) n FROM cowrie_wallets w WHERE purchased_balance!=COALESCE((SELECT SUM(delta) FROM cowrie_ledger WHERE wallet_id=w.id AND bucket='purchased'),0) OR bonus_balance!=COALESCE((SELECT SUM(delta) FROM cowrie_ledger WHERE wallet_id=w.id AND bucket='bonus'),0)");
   const activeClosures=count("SELECT COUNT(*) n FROM retention_closures c JOIN cowrie_wallets w ON w.id=c.wallet_id WHERE w.state!='deleted' OR w.closed_at IS NOT c.closed_at");
   const activeSuppression=count("SELECT COUNT(*) n FROM retention_suppression s WHERE (scope='wallet' AND EXISTS(SELECT 1 FROM cowrie_wallets w WHERE w.id=s.subject_id AND w.state='active')) OR (scope='attempt' AND EXISTS(SELECT 1 FROM quiz_attempts a WHERE a.id=s.subject_id AND a.status IN ('completed','in_progress'))) OR (scope='result' AND EXISTS(SELECT 1 FROM results r WHERE r.id=s.subject_id AND r.state='active'))");
   if(badBalances||activeClosures||activeSuppression||!count('SELECT COUNT(*) n FROM retention_closures')||!count('SELECT COUNT(*) n FROM retention_holds WHERE released_at IS NULL')||!count('SELECT COUNT(*) n FROM retention_suppression'))fail();
   state.protectionFacts={accountingVerified:true,holdsVerified:true,closedWalletsBlocked:true,deletionsSuppressed:true,accountingRows:{wallets:count('SELECT COUNT(*) n FROM cowrie_wallets'),ledger:count('SELECT COUNT(*) n FROM cowrie_ledger'),orders:count('SELECT COUNT(*) n FROM commerce_orders')}};
   state.restore=await prepareStreamedRestore(source,custody,key,id+'_plan',{pageSize:50,now:now()});
  }finally{source.close();}
  state.step=2;await save();
 }
 if(state.step===2){
  if(!state.inventoryInfo){state.inventoryInfo=await call({kind:'inventory-info'});await save();}
  const info=state.inventoryInfo,assertFrozen=async()=>(await call({kind:'inspect-fence'})).fenceSha256;
  if(!Array.isArray(info.folders)||info.folders.length!==17||!Number.isSafeInteger(info.count))fail();
  const mappings=new Map();
  const remoteRoot={folderId:info.folders[0],get:async name=>{const r=await call({kind:'root-get',name});return r.ciphertext===null?null:Buffer.from(r.ciphertext,'base64');},
   async put(name,bytes,retention){const r=await call({kind:'root-put',name,ciphertext:Buffer.from(bytes).toString('base64'),retention});mappings.set(name,r);return r.sha256;},
   index:{get:async name=>mappings.get(name)?.id,recoveryRecord:async name=>{const r=mappings.get(name);return r?{createdAt:r.createdAt,expiresAt:r.expiresAt}:null;}}};
  async function* records(){for(const folderId of info.folders){let cursor;do{const r=await call({kind:'inventory-page',inventoryId:id+'_inventory',folderId,...(cursor?{cursor}:{})});for(const file of r.files)yield file;cursor=r.cursor;}while(cursor);}}
  const journal=new DatabaseSync(join(root,id+'.inventory.sqlite'));
  try{state.inventory=await capturePinnedInventory({root:remoteRoot,key,id:id+'_inventory',records:records(),expectedCount:info.count,journal,assertFrozen,now:now()});}finally{journal.close();}
  state.step=3;await save();
 }
 if(state.step===3){await call({kind:'simulate-index-loss',pointer:state.inventory,job:id+'_loss'});state.step=4;await save();await fault('index_removed');}
 if(state.step===4){let r;do{r=await call({kind:'recover-index',pointer:state.inventory,job:id+'_index'});if(!r.runtimeAccess?.startsWith('blocked_'))fail();await fault('index_resumed');}while(!r.verified);state.step=5;await save();}
 if(state.step===5){let r;do{r=await call({kind:'restore-audit',pointer:state.restore,job:id+'_source'});if(!r.runtimeAccess?.startsWith('blocked_'))fail();}while(!r.verified);state.step=6;await save();}
 if(state.step===6){let r;do{r=await call({kind:'restore-clear',pointer:state.restore,job:id+'_source'});if(!r.runtimeAccess?.startsWith('blocked_'))fail();}while(!r.cleared);state.step=7;await save();await fault('source_cleared');}
 if(state.step===7){let r;do{r=await call({kind:'restore-import',pointer:state.restore,job:id+'_target'});if(!r.runtimeAccess?.startsWith('blocked_'))fail();await fault('import_resumed');}while(!r.imported);state.step=8;await save();}
 if(state.step===8){let r;do{r=await call({kind:'restore-verify',pointer:state.restore,job:id+'_target'});if(!r.runtimeAccess?.startsWith('blocked_'))fail();}while(!r.verified);state.step=9;await save();await fault('verification_complete');}
 if(state.step!==9)fail();
 const result={verified:true,...state.protectionFacts,prematureAccess:false,snapshotReceipt:state.snapshot.pointer.sha256,restoreReceipt:state.restore.sha256,inventoryReceipt:state.inventory.sha256,rows:state.materialized.rows,pages:state.materialized.pages,runtimeAccess:'blocked_pending_authority_suppression_receipt'};
 return {...result,sha256:recoveryHash(Buffer.from(JSON.stringify(result)))};
}
