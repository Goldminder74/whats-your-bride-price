import {encryptRecord,decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const reserved=new Set(['operational_authority_outbox','operational_recovery_checkpoints','retention_restore']);
const encode=v=>v instanceof Uint8Array?{binary:Buffer.from(v).toString('base64')}:v;
const fail=()=>{throw Error('segmented_snapshot_invalid');};

/** Immutable encrypted, bounded capture steps. The journal stays exporting until
 * a separate verified boundary is committed. A segment is NEVER a recovery receipt.
 * Caller must persist its returned pointer; a lost response retries the same step.
 * No global Drive list, new schema, schedule or application access is introduced.
 */
export function segmentedSnapshot(db,custody,key,{pageSize=50,pagesPerStep=25,now=Date.now}={}){
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(pagesPerStep)||pagesPerStep<1||pagesPerStep>25)fail();
 async function put(name,body){
  const prior=await custody.get(name),bytes=prior||encryptRecord(body,key,name);
  if(prior&&JSON.stringify(decryptRecord(prior,key,name))!==JSON.stringify(body))fail();
  const sha256=await custody.put(name,bytes),copy=await custody.get(name);
  if(!copy||recoveryHash(copy)!==sha256||JSON.stringify(decryptRecord(copy,key,name))!==JSON.stringify(body))fail();
  return {name,sha256};
 }
 async function read(pointer){
  if(!pointer||typeof pointer.name!=='string'||!/^[a-f0-9]{64}$/.test(pointer.sha256||''))fail();
  const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();
  return decryptRecord(bytes,key,pointer.name);
 }
 return async function step(head,previous=null){
  if(head?.state!=='exporting'||!/^[a-zA-Z0-9_-]{1,80}$/.test(head.manifest_hash||'')||!Number.isSafeInteger(head.expires_at)||head.expires_at<=now())fail();
  const fence={id:head.manifest_hash,sequence:head.sequence,headHash:head.head_hash,expiresAt:head.expires_at};
  async function check(){const row=(await db.query("SELECT state,manifest_hash,sequence,head_hash,expires_at FROM operational_recovery_checkpoints WHERE id='journal'"))[0];
   if(row?.state!=='exporting'||row.manifest_hash!==fence.id||row.sequence!==fence.sequence||row.head_hash!==fence.headHash||row.expires_at!==fence.expiresAt||row.expires_at<=now())fail();}
  await check();
  let state,segment=0;
  if(previous){const prior=await read(previous);
   if(JSON.stringify(prior.fence)!==JSON.stringify(fence)||prior.pageSize!==pageSize||prior.complete||previous.name!==fence.id+'.segment'+prior.segment+'.enc')fail();
   state=prior.next;segment=prior.segment+1;
  }else{
   const schema=await db.query("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name");
   const tables=[];
   for(const table of schema.filter(s=>s.type==='table'&&!reserved.has(s.name))){
    const columns=await db.query('PRAGMA table_info('+quote(table.name)+')');
    const primary=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
    const count=(await db.query('SELECT COUNT(*) n FROM '+quote(table.name)))[0]?.n;
    if(!primary.length||!Number.isSafeInteger(count)||count<0)fail();tables.push({name:table.name,primary,count});
   }
   const schemaFile=await put(fence.id+'.schema.enc',{version:1,schema});
   state={tables,table:0,offset:0,cursor:null,schemaFile};
  }
  if(!state||!Array.isArray(state.tables)||!Number.isInteger(state.table)||!Number.isSafeInteger(state.offset)||state.table<0||state.table>state.tables.length||state.offset<0)fail();
  const files=[];let pages=0;
  while(state.table<state.tables.length&&pages<pagesPerStep){
   await check();const table=state.tables[state.table];
   if(state.offset===table.count){state={...state,table:state.table+1,offset:0,cursor:null};continue;}
   const order=table.primary.map(quote).join(',');
   const predicate=state.cursor?' WHERE ('+order+') > ('+table.primary.map((_,i)=>'?'+(i+2)).join(',')+')':'';
   const rows=await db.query('SELECT * FROM '+quote(table.name)+predicate+' ORDER BY '+order+' LIMIT ?1',[pageSize,...(state.cursor||[])]);
   if(rows.length!==Math.min(pageSize,table.count-state.offset))fail();
   const cursor=table.primary.map(c=>rows.at(-1)[c]);if(cursor.some(v=>v===null||v===undefined))fail();
   files.push(await put(fence.id+'.t'+state.table+'.p'+state.offset+'.enc',{table:table.name,offset:state.offset,rows:rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,encode(v)])))}));
   state={...state,offset:state.offset+rows.length,cursor};pages++;
   // Verify once per completed table, rather than repeatedly scanning its full
   // row count for every page. The unchanged authority fence protects the keyset.
   if(state.offset===table.count&&(await db.query('SELECT COUNT(*) n FROM '+quote(table.name)))[0]?.n!==table.count)fail();
  }
  // Empty trailing tables require no additional data page or larger invocation.
  while(state.table<state.tables.length&&state.offset===state.tables[state.table].count){state={...state,table:state.table+1,offset:0,cursor:null};}
  await check();
  const complete=state.table===state.tables.length;
  const body={format:'wybp-d1-segment-v1',fence,pageSize,segment,previous,files,next:state,complete};
  const pointer=await put(fence.id+'.segment'+segment+'.enc',body);
  await check();return {pointer,complete,pages,runtimeAccess:'blocked_pending_verified_boundary'};
 };
}

/** Streams authenticated pages with access still blocked. Caller must finish its
 * own FK/accounting/suppression verification before issuing a recovery receipt.
 * Immutable segment pointers replace a global provider inventory for this capture;
 * this does not reconstruct a lost Drive file-ID index by itself.
 */
export async function* segmentedSnapshotPages(custody,key,finalPointer,{maxSegments=10000,now=Date.now}={}){
 if(!Number.isInteger(maxSegments)||maxSegments<1||maxSegments>10000)fail();
 async function read(pointer){
  if(!pointer||typeof pointer.name!=='string'||!/^[a-f0-9]{64}$/.test(pointer.sha256||''))fail();
  const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();
  return decryptRecord(bytes,key,pointer.name);
 }
 const pointers=[];let pointer=finalPointer,final;
 while(pointer){
  if(pointers.length>=maxSegments)fail();const body=await read(pointer);
  if(!final){final=body;if(!final.complete||final.format!=='wybp-d1-segment-v1'||!Number.isSafeInteger(final.fence?.expiresAt)||final.fence.expiresAt<=now())fail();}
  if(body.segment!==final.segment-pointers.length||body.pageSize!==final.pageSize||JSON.stringify(body.fence)!==JSON.stringify(final.fence)||pointer.name!==body.fence.id+'.segment'+body.segment+'.enc')fail();
  pointers.push(pointer);pointer=body.previous;
 }
 if(pointers.length!==final.segment+1)fail();
 const schema=await read(final.next.schemaFile),tables=final.next.tables;
 if(!Array.isArray(schema.schema)||!Array.isArray(tables))fail();
 yield {kind:'schema',schema:schema.schema,runtimeAccess:'blocked_pending_verified_boundary'};
 let table=0,offset=0;
 for(const segmentPointer of pointers.reverse()){
  const segment=await read(segmentPointer);
  if(!Array.isArray(segment.files)||segment.files.length>25)fail();
  for(const file of segment.files){
   if(final.fence.expiresAt<=now())fail();
   while(table<tables.length&&offset===tables[table].count){table++;offset=0;}
   const expected=tables[table];if(!expected||file.name!==final.fence.id+'.t'+table+'.p'+offset+'.enc')fail();
   const page=await read(file);
   if(page.table!==expected.name||page.offset!==offset||!Array.isArray(page.rows)||page.rows.length!==Math.min(final.pageSize,expected.count-offset))fail();
   offset+=page.rows.length;
   yield {kind:'page',...page,runtimeAccess:'blocked_pending_verified_boundary'};
  }
 }
 while(table<tables.length&&offset===tables[table].count){table++;offset=0;}
 if(table!==tables.length)fail();
 return {format:'wybp-d1-segment-v1',counts:Object.fromEntries(tables.map(t=>[t.name,t.count])),runtimeAccess:'blocked_pending_verified_boundary'};
}
