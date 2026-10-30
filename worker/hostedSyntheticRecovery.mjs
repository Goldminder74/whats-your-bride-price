import {encryptRecord,decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
import {restorePages,finishRestore} from '../scripts/restore-runtime.mjs';
import {readBoundary} from '../scripts/authority-runtime.mjs';
import {assertEmptyOperationalSource} from './authoritySnapshot.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const name='synthetic-hosted-populated-v1.enc',job='synthetic-hosted-populated-v1',cleanupJob=job+'-cleanup';
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const reject=()=>{throw Error('hosted_synthetic_recovery_blocked');};
const digest=value=>recoveryHash(Buffer.from(JSON.stringify(value)));
export function hostedSyntheticRecovery({env,db,custody,index,key}){
 async function checked(){const bytes=await custody.get(name);if(!bytes)reject();const bundle=decryptRecord(bytes,key,name);validate(bundle);return bundle;}
 function validate(bundle){if(env.WYBP_AUTHORITY_ROLE!=='production-ops'||env.WYBP_AUTHORITY_DATABASE_NAME!=='wybp-prod-d1-r001'||digest(bundle)!==env.WYBP_SYNTHETIC_RESTORE_PLAN_SHA256||bundle.scope!=='synthetic-only-v1'||digest(bundle.pages)!==bundle.manifestHash||!Array.isArray(bundle.tables)||!Array.isArray(bundle.cleanupPages))reject();}
 async function compare(bundle,empty=false,checkTriggers=true){
  if((await db.query('PRAGMA foreign_key_check')).length)return false;
  for(const table of bundle.tables){
   const count=(await db.query('SELECT COUNT(*) n FROM '+quote(table.name)))[0]?.n;
   if(count!==(empty?0:table.rows.length))return false;
   if(empty)continue;const actual=[];
   const projection=table.columns.map(c=>'quote('+quote(c)+') AS '+quote(c)).join(','),order=table.columns.map(quote).join(',');
   for(let offset=0;offset<count;offset+=100)actual.push(...(await db.query('SELECT '+projection+' FROM '+quote(table.name)+' ORDER BY '+order+' LIMIT 100 OFFSET ?1',[offset])).map(r=>JSON.stringify(r)));
   if(JSON.stringify(actual.sort())!==JSON.stringify(table.rows))return false;
  }
  if(!checkTriggers)return true;
  const triggers=await db.query("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name NOT LIKE 'operational_%' ORDER BY name");
  return JSON.stringify(triggers)===JSON.stringify(empty?bundle.originalTriggers:bundle.triggers);
 }
 return {
  async stage(bundle){validate(bundle);await assertEmptyOperationalSource(db);const prior=await custody.get(name),bytes=prior||encryptRecord(bundle,key,name);if(prior&&digest(decryptRecord(prior,key,name))!==digest(bundle))reject();await custody.put(name,bytes);return {staged:true,pages:bundle.pages.length,scope:bundle.scope};},
  async step({cleanup=false,interrupt=false}={}){
   const bundle=await checked(),id=cleanup?cleanupJob:job,pages=cleanup?bundle.cleanupPages:bundle.pages,hash=cleanup?digest(bundle.cleanupPages):bundle.manifestHash;
   if(cleanup&&!(await db.query('SELECT id FROM operational_recovery_checkpoints WHERE id=?1 AND state=\'complete\'',[job])).length)reject();
   try{await restorePages(db,id,hash,pages,Date.now(),()=>{if(interrupt)throw Error('synthetic_after_commit_interruption');},1);}catch(error){if(error.message!=='synthetic_after_commit_interruption')throw error;}
   const row=(await db.query('SELECT cursor,sequence,state FROM operational_recovery_checkpoints WHERE id=?1',[id]))[0];
   return {cursor:row.cursor,pages:row.sequence,imported:row.cursor===row.sequence,interrupted:interrupt,accessBlocked:!(await db.query("SELECT id FROM retention_restore WHERE id='active'")).length};
  },
  async finish(cleanup=false){
   const bundle=await checked(),id=cleanup?cleanupJob:job,hash=cleanup?digest(bundle.cleanupPages):bundle.manifestHash,verification=id+'-verification';
   const imported=(await db.query('SELECT cursor,sequence FROM operational_recovery_checkpoints WHERE id=?1',[id]))[0];if(!imported||imported.cursor!==imported.sequence)reject();
   let progress=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[verification]))[0];
   if(!progress){const at=Date.now();await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?2,0,'importing',1,?4,?5)",params:[verification,hash,bundle.tables.length,at,at+RETENTION_POLICY.backupDays*RETENTION_DAY]}]);progress={cursor:0,manifest_hash:hash};}
   if(progress.manifest_hash!==hash)reject();const end=Math.min(progress.cursor+8,bundle.tables.length);
   if(!await compare({...bundle,tables:bundle.tables.slice(progress.cursor,end)},cleanup,false))reject();
   await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET cursor=CASE WHEN cursor=?2 THEN ?3 ELSE -1 END,version=version+1 WHERE id=?1",params:[verification,progress.cursor,end]}]);
   if(end<bundle.tables.length)return {verified:false,pending:true,tablesChecked:end,total:bundle.tables.length};
   if(!await compare({...bundle,tables:[]},cleanup,true))reject();
   const result=await finishRestore(db,id,hash,async()=>true);await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id=?1",params:[verification]}]);return {...result,verified:true,scope:'synthetic-only-v1'};
  },
  async verifyProtection(){
   await checked();if(!(await db.query("SELECT id FROM operational_recovery_checkpoints WHERE id=?1 AND state='complete'",[job])).length)reject();
   let closedDenied=false,accountingDenied=false;
   try{await db.batch([{sql:"UPDATE cowrie_wallets SET state='active'",params:[]}]);}catch(error){closedDenied=/cannot reopen/.test(error.message);}
   try{await db.batch([{sql:'UPDATE cowrie_wallets SET purchased_balance=999',params:[]}]);}catch(error){accountingDenied=/cache mismatch/.test(error.message);}
   const counts={};for(const [table,where] of [['commerce_orders','1'],['retention_cases',"closed_at IS NOT NULL"],['retention_holds','released_at IS NULL'],['quiz_attempts',"status='deleted'"],['results',"state='deleted'"],['cowrie_wallets',"state='deleted' AND purchased_balance=0 AND closed_at IS NOT NULL"]])counts[table]=(await db.query('SELECT COUNT(*) n FROM '+quote(table)+' WHERE '+where))[0]?.n;
   if(!closedDenied||!accountingDenied||counts.commerce_orders!==1||counts.retention_cases!==123||counts.retention_holds!==1||counts.quiz_attempts!==1||counts.results!==1||counts.cowrie_wallets!==1||(await db.query('PRAGMA foreign_key_check')).length)reject();
   return {verified:true,closedWalletReopenDenied:closedDenied,accountingCorruptionDenied:accountingDenied,foreignKeysValid:true,orders:1,closedCases:123,legalHolds:1,deletedAttempts:1,deletedResults:1,accessBlocked:!(await db.query("SELECT id FROM retention_restore WHERE id='active'")).length};
  },
  async restoreEmptyReceipt(){await checked();await assertEmptyOperationalSource(db);if(!(await db.query("SELECT id FROM operational_recovery_checkpoints WHERE id=?1 AND state='complete'",[cleanupJob])).length)reject();await readBoundary(custody,key,'commissioning-empty-baseline-v1',env.WYBP_RESTORE_RECEIPT_SHA256);await db.batch([{sql:"INSERT INTO retention_restore(id,receipt_hash,verified_at) VALUES('active',?1,?2) ON CONFLICT(id) DO NOTHING",params:[env.WYBP_RESTORE_RECEIPT_SHA256,Date.now()]}]);return {emptyBaselineVerified:true};},
  async inventory(){const proof=await custody.inventoryReceipt();return {...proof,forcedPageSize:custody.pageSize};},
  async recoverInventory(files,receipt,interrupt=false){
   let stage='receipt';try{
   if(receipt!==env.WYBP_FULL_INVENTORY_RECEIPT||digest(files)!==receipt)reject();
   stage='head';
   let row=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='synthetic-full-index-loss'"))[0];
   if(!row){const head=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0];if(head?.state!=='idle'||head.sequence!==0||head.head_hash!=='0'.repeat(64))reject();const at=Date.now();stage='loss_transaction';await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='exporting',version=version+1 WHERE id='journal' AND state='idle' AND sequence=0",params:[]},{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('synthetic-full-index-loss','restore',?1,?2,?1,0,'importing',1,?3,?4)",params:[receipt,files.length,at,at+RETENTION_POLICY.backupDays*RETENTION_DAY]},{sql:"DELETE FROM operational_recovery_checkpoints WHERE kind='custody' AND substr(id,1,?1)=?2",params:[index.prefix.length,index.prefix]}]);}
   else if(row.manifest_hash!==receipt||row.sequence!==files.length)reject();
   if(!row||row.cursor<files.length){stage='recover';try{await custody.recoverIndex(files,receipt,async(_file,count)=>{await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET cursor=MAX(cursor,?1),version=version+1 WHERE id='synthetic-full-index-loss'",params:[count]}]);if(interrupt&&count===2)throw Error('synthetic_index_interruption');});}catch(error){if(error.message!=='synthetic_index_interruption')throw error;return {interrupted:true,accessBlocked:true,recovered:2};}return {reconstructed:true,verificationRequired:true,files:files.length,accessBlocked:true};}
   stage='verify';
   if((await custody.inventoryReceipt()).sha256!==receipt)reject();await readBoundary(custody,key,'commissioning-empty-baseline-v1',env.WYBP_RESTORE_RECEIPT_SHA256);
   stage='complete';await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id='synthetic-full-index-loss' AND manifest_hash=?1",params:[receipt]},{sql:"UPDATE operational_recovery_checkpoints SET state='idle',version=version+1 WHERE id='journal' AND state='exporting' AND sequence=0",params:[]}]);return {verified:true,files:files.length,originalClocksPreserved:true};
   }catch(error){const kind=error.message==='authority_batch'?'batch_shape':error.message==='authority_query'?'query_shape':/not authorized|SQLITE_AUTH/i.test(error.message+' '+error.cause?.message)?'authorization':/SQLITE_|D1_ERROR/i.test(error.message+' '+error.cause?.message)?'database':error.name==='TypeError'?'type':error.name==='ReferenceError'?'reference':/bind|parameter/i.test(error.message)?'binding':/constraint/i.test(error.message)?'constraint':'other';throw Error('hosted_inventory_'+stage+'_'+kind);}
  }
 };
}
