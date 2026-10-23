// Offline plan construction and bounded import. No credential loading, provider
// calls, schema migration, target deletion or application-access grant occurs here.
import {createHash} from 'node:crypto';
import {encryptRecord,decryptRecord,recoveryHash} from './recovery-crypto.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
import {assertBenchmarkResource} from './approved-benchmark-budget.mjs';
const windowMs=RETENTION_POLICY.backupDays*RETENTION_DAY;
const reserved=new Set(['schema_migrations','d1_migrations','operational_authority_outbox','operational_recovery_checkpoints','retention_restore']);
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const fail=()=>{throw Error('streamed_restore_unavailable');};
const hash=v=>recoveryHash(Buffer.from(JSON.stringify(v)));
const literal=v=>v===null?'NULL':typeof v==='bigint'?String(v):typeof v==='number'?(Number.isFinite(v)?'CAST('+String(v)+' AS REAL)':fail()):v instanceof Uint8Array?"X'"+Buffer.from(v).toString('hex')+"'":typeof v==='string'&&!v.includes('\0')?"'"+v.replaceAll("'","''")+"'":fail();
const cursorValue=v=>typeof v==='string'||(typeof v==='number'&&Number.isSafeInteger(v))?v:fail();
// SQLite quote(TEXT) truncates at NUL. Hash text/blob bytes explicitly so such
// values cannot disappear from verification, and distinguish REAL from INTEGER.
const projection=columns=>columns.map(c=>{const q=quote(c);return "CASE typeof("+q+") WHEN 'text' THEN 'text:'||hex("+q+") WHEN 'blob' THEN 'blob:'||hex("+q+") ELSE typeof("+q+")||':'||quote("+q+") END AS "+q;}).join(',');
const schemaSql="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name";
const normalSchema=rows=>rows.filter(r=>!['d1_migrations','schema_migrations'].includes(r.tbl_name)).map(r=>({...r}));

function describe(source){
 if(source.prepare('PRAGMA foreign_key_check').all().length)fail();
 const schema=normalSchema(source.prepare(schemaSql).all());
 const remaining=new Set(schema.filter(s=>s.type==='table'&&!reserved.has(s.name)).map(s=>s.name)),tables=[];
 while(remaining.size){
  const ready=[...remaining].filter(t=>source.prepare('PRAGMA foreign_key_list('+quote(t)+')').all().every(f=>f.table===t||!remaining.has(f.table)));
  if(!ready.length)fail();
  for(const name of ready){
   const info=source.prepare('PRAGMA table_info('+quote(name)+')').all(),columns=info.map(c=>c.name),primary=info.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
   if(!primary.length||columns.some(c=>c.startsWith('__wybp_cursor')))fail();
   const canonical=projection(columns),order=primary.map(quote).join(',');
   const sha=createHash('sha256');let count=0;
   for(const row of source.prepare('SELECT '+canonical+' FROM '+quote(name)+' ORDER BY '+order).iterate()){sha.update(JSON.stringify(row)+'\n');count++;}
   tables.push({name,columns,primary,count,sha256:sha.digest('hex')});remaining.delete(name);
  }
 }
 return {schema,tables,triggers:schema.filter(s=>s.type==='trigger'&&!s.name.startsWith('operational_')).map(({name,sql})=>({name,sql}))};
}
function* pages(source,description,pageSize){
 const opening=[...description.tables.map(t=>({sql:'SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM '+quote(t.name)+") THEN 1 ELSE json('restore_target_not_empty') END",params:[]})),...description.triggers.map(t=>({sql:'DROP TRIGGER '+quote(t.name),params:[]}))];
 for(let i=0;i<opening.length;i+=pageSize)yield opening.slice(i,i+pageSize);
 for(const table of description.tables){
  const self=source.prepare('PRAGMA foreign_key_list('+quote(table.name)+')').all().filter(f=>f.table===table.name);
  if(self.length>1)fail();let sql='SELECT * FROM '+quote(table.name)+' ORDER BY '+table.primary.map(quote).join(',');
  if(self.length){
   const f=self[0];if(table.primary.length!==1||f.to!==table.primary[0])fail();
   sql=`WITH RECURSIVE walk(k,depth) AS (SELECT ${quote(f.to)},0 FROM ${quote(table.name)} WHERE ${quote(f.from)} IS NULL OR ${quote(f.from)}=${quote(f.to)} UNION ALL SELECT c.${quote(f.to)},p.depth+1 FROM ${quote(table.name)} c JOIN walk p ON c.${quote(f.from)}=p.k WHERE c.${quote(f.from)}<>c.${quote(f.to)}) SELECT t.* FROM ${quote(table.name)} t JOIN walk p ON t.${quote(f.to)}=p.k ORDER BY p.depth,t.${quote(f.to)}`;
  }
  const query=source.prepare(sql);query.setReadBigInts(true);let page=[],count=0;
  for(const row of query.iterate()){
   page.push({sql:'INSERT INTO '+quote(table.name)+'('+table.columns.map(quote).join(',')+') VALUES('+table.columns.map(c=>literal(row[c])).join(',')+')',params:[]});count++;
   if(page.length===pageSize){yield page;page=[];}
  }
  if(page.length)yield page;if(count!==table.count)fail();
 }
 for(let i=0;i<description.triggers.length;i+=pageSize)yield description.triggers.slice(i,i+pageSize).map(t=>({sql:t.sql,params:[]}));
}
async function read(custody,key,pointer){
 if(!pointer||typeof pointer.name!=='string'||!/^[a-f0-9]{64}$/.test(pointer.sha256||''))fail();
 const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();return decryptRecord(bytes,key,pointer.name);
}
async function put(custody,key,name,body){
 if(Buffer.byteLength(JSON.stringify(body))>3500000)fail();
 const prior=await custody.get(name),bytes=prior||encryptRecord(body,key,name);
 if(prior&&JSON.stringify(decryptRecord(prior,key,name))!==JSON.stringify(body))fail();
 const sha256=await custody.put(name,bytes);if(recoveryHash(await custody.get(name))!==sha256)fail();return {name,sha256};
}
export async function prepareStreamedRestore(source,custody,key,id,{pageSize=25,packPages=false,now=Date.now(),provenance=null}={}){
 if(typeof packPages!=='boolean')fail();
 if(provenance!==null&&(!/^[a-f0-9]{64}$/.test(provenance.boundarySha256||'')||!/^[a-f0-9]{64}$/.test(provenance.snapshotSha256||'')||!Number.isSafeInteger(provenance.createdAt)||provenance.createdAt>now||provenance.expiresAt<=now||provenance.expiresAt-provenance.createdAt!==windowMs))fail();
 if(!/^[a-zA-Z0-9_-]{1,70}$/.test(id)||!Number.isInteger(pageSize)||pageSize<1||pageSize>50)fail();
 const description=describe(source),segments=[];let files=[],count=0;
 const schemaHash=hash(description.schema);
 const startName=id+'.restore.start.enc',old=await custody.get(startName);
 const start=old?decryptRecord(old,key,startName):{schemaHash,tablesHash:hash(description.tables),pageSize,packPages,...(provenance?{provenance}:{}),createdAt:provenance?.createdAt??now,expiresAt:provenance?.expiresAt??now+windowMs};
 if(start.schemaHash!==schemaHash||start.tablesHash!==hash(description.tables)||start.pageSize!==pageSize||(start.packPages===true)!==packPages||start.expiresAt<=now)fail();
 if(hash(start.provenance??null)!==hash(provenance))fail();
 if(!old)await put(custody,key,startName,start);
 // Verification hashes are packed into bounded encrypted blocks, rather than
 // one Drive object per100 rows or a full in-memory target comparison.
 for(const [tableIndex,table] of description.tables.entries()){
  const canonical=projection(table.columns),order=table.primary.map(quote).join(',');
  const query=source.prepare('SELECT '+canonical+','+table.primary.map((c,i)=>quote(c)+' AS "__wybp_cursor'+i+'"').join(',')+' FROM '+quote(table.name)+' ORDER BY '+order);
  let sha=createHash('sha256'),rows=0,leaves=[],lastCursor;table.verification=[];
  const write=async()=>{table.verification.push(await put(custody,key,id+'.restore.verify.t'+tableIndex+'.b'+table.verification.length+'.enc',{leaves}));leaves=[];};
  for(const value of query.iterate()){
   sha.update(JSON.stringify(Object.fromEntries(table.columns.map(c=>[c,value[c]])))+'\n');rows++;
   lastCursor=table.primary.map((_,i)=>cursorValue(value['__wybp_cursor'+i]));
   if(rows===100){leaves.push({rows,sha256:sha.digest('hex'),lastCursor});sha=createHash('sha256');rows=0;if(leaves.length===1000)await write();}
  }
  if(rows)leaves.push({rows,sha256:sha.digest('hex'),lastCursor});if(leaves.length)await write();
 }
 for(const page of pages(source,description,pageSize)){
  if(count>=250000)fail();files.push(packPages?{index:count,statements:page}:await put(custody,key,id+'.restore.page'+count+'.enc',{index:count,statements:page}));count++;
  if(files.length===25){segments.push(await put(custody,key,id+'.restore.segment'+segments.length+'.enc',packPages?{pages:files}:{files}));files=[];}
 }
 if(files.length)segments.push(await put(custody,key,id+'.restore.segment'+segments.length+'.enc',packPages?{pages:files}:{files}));
 return put(custody,key,id+'.restore.manifest.enc',{version:packPages?2:1,id,pageSize,pages:count,segments,...description,schemaHash,...(provenance?{provenance}:{}),createdAt:start.createdAt,expiresAt:start.expiresAt});
}
export async function importStreamedRestore(target,custody,key,pointer,{resource,job,maxPages=10,now=Date.now(),fault=()=>{}}){
 assertBenchmarkResource('database',resource);
 if(!/^synthetic_[a-zA-Z0-9_-]{1,70}$/.test(job))fail();
 return importRestore(target,custody,key,pointer,{job,maxPages,now,fault});
}
/** Private production recovery only, into an empty matching-schema target.
 * This never deletes populated data, installs a receipt, migrates or grants access. */
export async function importProductionRestore(target,custody,key,pointer,{role,databaseName,databaseId,boundarySha256,snapshotSha256,job,maxPages=10,now=Date.now(),fault=()=>{}}={}){
 if(role!=='production-ops'||databaseName!=='wybp-prod-d1-r001'||databaseId!=='a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'||!/^recovery_[a-zA-Z0-9_-]{1,60}$/.test(job||'')||!/^[a-f0-9]{64}$/.test(boundarySha256||'')||!/^[a-f0-9]{64}$/.test(snapshotSha256||''))fail();
 const manifest=await read(custody,key,pointer),p=manifest.provenance;
 if(!p||p.boundarySha256!==boundarySha256||p.snapshotSha256!==snapshotSha256||p.createdAt!==manifest.createdAt||p.expiresAt!==manifest.expiresAt)fail();
 return importRestore(target,custody,key,pointer,{job,maxPages,now,fault});
}
async function importRestore(target,custody,key,pointer,{job,maxPages,now,fault}){
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>25)fail();
 const manifest=await read(custody,key,pointer);
 if(![1,2].includes(manifest.version)||manifest.expiresAt<=now||manifest.expiresAt-manifest.createdAt!==windowMs||manifest.segments.length>10000||manifest.pages>250000)fail();
 let checkpoint=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];
 if(!checkpoint){
  if(hash(normalSchema(await target.query(schemaSql)))!==manifest.schemaHash)fail();
  const empty=manifest.tables.map(t=>({sql:'SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM '+quote(t.name)+") THEN 1 ELSE json('restore_target_not_empty') END",params:[]}));
  // Schema/empty-target checks precede disabling access or altering any trigger.
  for(let offset=0;offset<empty.length;offset+=50)await target.batch(empty.slice(offset,offset+50));
  await target.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?2,0,'importing',1,?4,?5)",params:[job,pointer.sha256,manifest.pages,manifest.createdAt,manifest.expiresAt]},{sql:'DELETE FROM retention_restore',params:[]}]);
  checkpoint=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];
 }
 if(checkpoint.kind!=='restore'||checkpoint.manifest_hash!==pointer.sha256||checkpoint.head_hash!==pointer.sha256||checkpoint.sequence!==manifest.pages||checkpoint.expires_at!==manifest.expiresAt||!['importing','complete'].includes(checkpoint.state))fail();
 if(checkpoint.state==='complete')return {imported:true,cursor:checkpoint.cursor,pages:manifest.pages,runtimeAccess:'blocked_pending_authority_suppression_receipt'};
 let cursor=checkpoint.cursor,processed=0,segmentNumber=-1,segment;
 while(cursor<manifest.pages&&processed<maxPages){
  const nextSegment=Math.floor(cursor/25);
  if(nextSegment!==segmentNumber){segment=await read(custody,key,manifest.segments[nextSegment]);segmentNumber=nextSegment;}
  const page=manifest.version===2?segment.pages?.[cursor%25]:await read(custody,key,segment.files[cursor%25]);
  if(!page||page.index!==cursor||!Array.isArray(page.statements)||!page.statements.length||page.statements.length>50||page.statements.some(s=>/operational_|retention_restore/i.test(s.sql)))fail();
  await target.batch([{sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND cursor=?2 AND state='importing' AND manifest_hash=?3 AND expires_at>?4) THEN 1 ELSE json('restore_cursor_conflict') END",params:[job,cursor,pointer.sha256,now]},...page.statements,{sql:'UPDATE operational_recovery_checkpoints SET cursor=cursor+1,version=version+1 WHERE id=?1 AND cursor=?2',params:[job,cursor]}]);
  cursor++;processed++;await fault('page_committed',cursor);
 }
 return {imported:cursor===manifest.pages,cursor,pages:manifest.pages,runtimeAccess:'blocked_pending_verification'};
}
export async function verifyStreamedRestoreStep(target,custody,key,pointer,{job,maxPages=5,now=Date.now()}={}){
 if(!/^synthetic_[a-zA-Z0-9_-]{1,70}$/.test(job))fail();
 return verifyRestore(target,custody,key,pointer,{job,maxPages,now});
}
export async function verifyProductionRestoreStep(target,custody,key,pointer,options={}){
 const {role,databaseName,databaseId,boundarySha256,snapshotSha256,job,maxPages=5,now=Date.now()}=options;
 if(role!=='production-ops'||databaseName!=='wybp-prod-d1-r001'||databaseId!=='a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'||!/^recovery_[a-zA-Z0-9_-]{1,60}$/.test(job||'')||!/^[a-f0-9]{64}$/.test(boundarySha256||'')||!/^[a-f0-9]{64}$/.test(snapshotSha256||''))fail();
 const manifest=await read(custody,key,pointer),p=manifest.provenance;
 if(!p||p.boundarySha256!==boundarySha256||p.snapshotSha256!==snapshotSha256||p.createdAt!==manifest.createdAt||p.expiresAt!==manifest.expiresAt)fail();
 return verifyRestore(target,custody,key,pointer,{job,maxPages,now});
}
async function verifyRestore(target,custody,key,pointer,{job,maxPages,now}){
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>25)fail();
 const manifest=await read(custody,key,pointer),checkpoint=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];
 if(!checkpoint||checkpoint.manifest_hash!==pointer.sha256||checkpoint.cursor!==manifest.pages||checkpoint.expires_at<=now||!['importing','complete'].includes(checkpoint.state))fail();
 const progressId=job+'_verify';
 await target.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?2,0,'importing',1,?4,?5) ON CONFLICT(id) DO NOTHING",params:[progressId,pointer.sha256,manifest.tables.length,manifest.createdAt,manifest.expiresAt]}]);
 let processed=0;
 for(;;){
  const progress=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[progressId]))[0];
  if(progress.manifest_hash!==pointer.sha256||progress.expires_at<=now)fail();
  if(progress.cursor===manifest.tables.length)break;
  if(processed>=maxPages)return {verified:false,processed,runtimeAccess:'blocked_pending_verification'};
  const tableIndex=progress.cursor,table=manifest.tables[tableIndex],tableId=job+'_verify_'+tableIndex;
  if(!Array.isArray(table.verification)||table.verification.length!==Math.ceil(table.count/100000))fail();
  let row=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[tableId]))[0];
  if(!row){await target.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?4,0,'importing',1,?5,?6) ON CONFLICT(id) DO NOTHING",params:[tableId,pointer.sha256,Math.ceil(table.count/100),encryptRecord({cursor:null},key,tableId).toString(),manifest.createdAt,manifest.expiresAt]}]);row=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[tableId]))[0];}
  if(row.manifest_hash!==pointer.sha256||row.expires_at<=now||row.sequence!==Math.ceil(table.count/100))fail();
  const state=decryptRecord(Buffer.from(row.head_hash),key,tableId),cursor=state.cursor;
  const order=table.primary.map(quote).join(','),predicate=cursor?' WHERE ('+order+') > ('+cursor.map((_,i)=>'?'+(i+1)).join(',')+')':'';
  const canonical=projection(table.columns);
  const values=await target.query('SELECT '+canonical+','+table.primary.map((c,i)=>quote(c)+' AS "__wybp_cursor'+i+'"').join(',')+' FROM '+quote(table.name)+predicate+' ORDER BY '+order+' LIMIT 100',cursor||[]);
  if(row.cursor===row.sequence){
   if(values.length)fail();
   await target.batch([{sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND cursor=?2 AND version=?3) THEN 1 ELSE json('verification_cursor_conflict') END",params:[progressId,tableIndex,progress.version]},{sql:"UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id=?1",params:[tableId]},{sql:'UPDATE operational_recovery_checkpoints SET cursor=cursor+1,version=version+1 WHERE id=?1',params:[progressId]}]);processed++;continue;
  }
  const block=await read(custody,key,table.verification[Math.floor(row.cursor/1000)]),leaf=block.leaves[row.cursor%1000];
  if(!leaf||values.length!==leaf.rows)fail();const sha=createHash('sha256');
  for(const value of values)sha.update(JSON.stringify(Object.fromEntries(table.columns.map(c=>[c,value[c]])))+'\n');
  const lastCursor=table.primary.map((_,i)=>cursorValue(values.at(-1)['__wybp_cursor'+i]));
  if(sha.digest('hex')!==leaf.sha256||JSON.stringify(lastCursor)!==JSON.stringify(leaf.lastCursor))fail();
  await target.batch([{sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND cursor=?2 AND version=?3 AND state='importing') THEN 1 ELSE json('verification_page_conflict') END",params:[tableId,row.cursor,row.version]},{sql:'UPDATE operational_recovery_checkpoints SET cursor=cursor+1,head_hash=?2,version=version+1 WHERE id=?1',params:[tableId,encryptRecord({cursor:lastCursor},key,tableId).toString()]}]);processed++;
 }
 if((await target.query('PRAGMA foreign_key_check')).length)fail();
 if(hash(normalSchema(await target.query(schemaSql)))!==manifest.schemaHash)fail();
 await target.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id=?1 AND manifest_hash=?2 AND cursor=sequence AND state='importing'",params:[job,pointer.sha256]}]);
 return {verified:true,runtimeAccess:'blocked_pending_authority_suppression_receipt'};
}
export async function verifyStreamedRestore(target,custody,key,pointer,options){let result;do{result=await verifyStreamedRestoreStep(target,custody,key,pointer,{...options,maxPages:25});}while(!result.verified);return result;}

// Non-destructive pre-restore audit of the populated synthetic source. The
// operator must hold the exporting fence for the entire audit. This receipt
// never authorises deletion, import into a populated target, or runtime access.
export async function auditStreamedSourceStep(target,custody,key,pointer,{resource,job,maxPages=5,now=Date.now(),assertFrozen}={}){
 assertBenchmarkResource('database',resource);
 if(typeof assertFrozen!=='function'||!/^synthetic_[a-zA-Z0-9_-]{1,60}$/.test(job))fail();
 const fence=await assertFrozen();if(typeof fence!=='string'||!/^[a-f0-9]{64}$/.test(fence))fail();
 const manifest=await read(custody,key,pointer),auditJob=job+'_audit';
 if(![1,2].includes(manifest.version)||manifest.expiresAt<=now||manifest.expiresAt-manifest.createdAt!==windowMs||hash(normalSchema(await target.query(schemaSql)))!==manifest.schemaHash)fail();
 const pinJob=job+'_fence';
 await target.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,0,?3,0,'importing',1,?4,?5) ON CONFLICT(id) DO NOTHING",params:[pinJob,pointer.sha256,fence,manifest.createdAt,manifest.expiresAt]}]);
 const pin=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[pinJob]))[0];
 if(pin.manifest_hash!==pointer.sha256||pin.head_hash!==fence||pin.expires_at<=now)fail();
 await target.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?2,?3,'importing',1,?4,?5) ON CONFLICT(id) DO NOTHING",params:[auditJob,pointer.sha256,manifest.pages,manifest.createdAt,manifest.expiresAt]},{sql:'DELETE FROM retention_restore',params:[]}]);
 const result=await verifyStreamedRestoreStep(target,custody,key,pointer,{job:auditJob,maxPages,now});
 if(await assertFrozen()!==fence)fail();
 return {verified:result.verified,runtimeAccess:'blocked_pending_authority_suppression_receipt',sourceFenceSha256:fence};
}

// Destructive only inside the exact disposable benchmark database. A complete
// fenced, encrypted source audit is mandatory. Trigger stages are bounded;
// all dependent table deletion shares one deferred-FK transaction. Each stage
// commits its cursor atomically and access remains blocked throughout.
export async function clearAuditedSyntheticTarget(target,custody,key,pointer,{resource,job,now=Date.now(),assertFrozen,fault=()=>{}}={}){
 assertBenchmarkResource('database',resource);
 if(typeof assertFrozen!=='function'||!/^synthetic_[a-zA-Z0-9_-]{1,60}$/.test(job))fail();
 const manifest=await read(custody,key,pointer),clearJob=job+'_clear';
 let prior=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[clearJob]))[0];
 if(prior){if(prior.manifest_hash!==pointer.sha256||!['complete','importing'].includes(prior.state)||prior.expires_at<=now)fail();if(prior.state==='complete')return {cleared:true,replayed:true,runtimeAccess:'blocked_pending_import'};}
 const audit=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job+'_audit']))[0];
 const pin=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job+'_fence']))[0];
 const fence=await assertFrozen();
 if(!audit||audit.manifest_hash!==pointer.sha256||audit.state!=='complete'||audit.expires_at<=now||!pin||pin.manifest_hash!==pointer.sha256||pin.head_hash!==fence||manifest.expiresAt<=now)fail();
 const stages=[];
 for(let i=0;i<manifest.triggers.length;i+=25)stages.push(manifest.triggers.slice(i,i+25).map(t=>({sql:'DROP TRIGGER '+quote(t.name),params:[]})));
 stages.push([{sql:'PRAGMA defer_foreign_keys=ON',params:[]},...[...manifest.tables].reverse().map(t=>({sql:'DELETE FROM '+quote(t.name),params:[]}))]);
 for(let i=0;i<manifest.triggers.length;i+=25)stages.push(manifest.triggers.slice(i,i+25).map(t=>({sql:t.sql,params:[]})));
 if(stages.some(s=>s.length>95))fail();
 if(!prior){
  if(hash(normalSchema(await target.query(schemaSql)))!==manifest.schemaHash)fail();
  await target.batch([{sql:'DELETE FROM retention_restore',params:[]},{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?4,0,'importing',1,?5,?6)",params:[clearJob,pointer.sha256,stages.length,fence,manifest.createdAt,manifest.expiresAt]}]);
  prior=(await target.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[clearJob]))[0];
 }
 if(prior.sequence!==stages.length||prior.head_hash!==fence||prior.cursor>=stages.length)fail();
 await fault('before_clear');if(await assertFrozen()!==fence)fail();
 const complete=prior.cursor+1===stages.length;
 await target.batch([{sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND cursor=?2 AND version=?3 AND state='importing') THEN 1 ELSE json('clear_cursor_conflict') END",params:[clearJob,prior.cursor,prior.version]},...stages[prior.cursor],{sql:'UPDATE operational_recovery_checkpoints SET cursor=cursor+1,version=version+1,state=?2 WHERE id=?1',params:[clearJob,complete?'complete':'importing']}]);await fault(complete?'clear_committed':'clear_stage_committed');
 if(await assertFrozen()!==fence)fail();
 return {cleared:complete,replayed:false,runtimeAccess:'blocked_pending_import'};
}
