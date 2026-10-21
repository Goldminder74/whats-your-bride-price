import {segmentedSnapshot} from './segmentedSnapshot.mjs';
import {encryptRecord,decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
const fail=()=>{throw Error('bounded_snapshot_unavailable');};
const hash=value=>recoveryHash(Buffer.from(JSON.stringify(value)));
const fenceOf=h=>({id:h.manifest_hash,sequence:h.sequence,headHash:h.head_hash,expiresAt:h.expires_at});

/** One capture OR one verification segment per RPC. Progress is authenticated,
 * encrypted and caller-persisted; it never grants application access. No global
 * inventory, additional schema or growing per-row checkpoint array is required.
 */
export async function boundedSnapshotStep(db,custody,key,head,progress=null,{now=Date.now,pagesPerStep=25}={}){
 if(!head||head.state!=='exporting'||!/^[a-zA-Z0-9_-]{1,80}$/.test(head.manifest_hash)||!Number.isSafeInteger(head.expires_at)||head.expires_at<=now()||!Number.isInteger(pagesPerStep)||pagesPerStep<1||pagesPerStep>25)fail();
 const fence=fenceOf(head),aad=head.manifest_hash+'.bounded-progress';
 const check=async()=>{const row=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0];if(!row||row.state!=='exporting'||hash(fenceOf(row))!==hash(fence)||row.expires_at<=now())fail();};
 const read=async pointer=>{if(!pointer||typeof pointer.name!=='string'||!/^[a-f0-9]{64}$/.test(pointer.sha256||''))fail();const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();return decryptRecord(bytes,key,pointer.name);};
 await check();
 let state={version:1,fence,pagesPerStep,phase:'capture',snapshot:null};
 if(progress!==null){if(typeof progress!=='string'||progress.length>2000000)fail();state=decryptRecord(Buffer.from(progress,'base64'),key,aad);if(state.version!==1||hash(state.fence)!==hash(fence)||state.pagesPerStep!==pagesPerStep)fail();}
 if(state.phase==='capture'){
  const captured=await segmentedSnapshot(db,custody,key,{packPages:true,pagesPerStep,now})(head,state.snapshot);
  state.snapshot=captured.pointer;
  if(captured.complete){
   const last=await read(state.snapshot);state.phase='verify';state.cursor=state.snapshot;state.segment=last.segment;
   state.tables=last.next.tables;state.schema=last.next.schemaFile;state.table=state.tables.length-1;state.offset=state.tables.at(-1)?.count||0;state.checked=0;
  }
 }else if(state.phase==='verify'){
  const part=await read(state.cursor);
  if(part.format!=='wybp-d1-segment-v2'||hash(part.fence)!==hash(fence)||part.segment!==state.segment||state.cursor.name!==fence.id+'.segment'+state.segment+'.enc'||!Array.isArray(part.files)||part.files.length>pagesPerStep)fail();
  for(const file of [...part.files].reverse()){
   while(state.table>=0&&state.offset===0){state.table--;state.offset=state.tables[state.table]?.count||0;}
   const table=state.tables[state.table],page=file.data;
   if(!table||!page||page.table!==table.name||!Number.isSafeInteger(page.offset)||page.offset<0||!Array.isArray(page.rows)||!page.rows.length||page.rows.length!==Math.min(50,table.count-page.offset)||page.offset+page.rows.length!==state.offset||file.name!==fence.id+'.t'+state.table+'.p'+page.offset+'.enc')fail();
   state.offset=page.offset;
  }
  state.checked++;state.cursor=part.previous;state.segment--;
  if(state.cursor===null){
   while(state.table>=0&&state.offset===0){state.table--;state.offset=state.tables[state.table]?.count||0;}
   if(state.segment!==-1||state.table!==-1)fail();
   const schema=await read(state.schema);if(!Array.isArray(schema.schema))fail();
   state.phase='complete';
  }else if(state.segment<0)fail();
 }else if(state.phase!=='complete')fail();
 await check();
 let proof=null;
 if(state.phase==='complete'){
  const name=fence.id+'.snapshot-proof.enc',body={version:1,format:'wybp-bounded-snapshot-v1',fence,snapshot:state.snapshot,schema:state.schema,counts:Object.fromEntries(state.tables.map(t=>[t.name,t.count])),checkedSegments:state.checked};
  const prior=await custody.get(name),bytes=prior||encryptRecord(body,key,name);if(prior&&hash(decryptRecord(prior,key,name))!==hash(body))fail();
  const sha256=await custody.put(name,bytes),download=await custody.get(name);if(!download||recoveryHash(download)!==sha256)fail();proof={name,sha256};
 }
 await check();
 return {progress:encryptRecord(state,key,aad).toString('base64'),complete:state.phase==='complete',snapshot:state.snapshot,proof,runtimeAccess:'blocked_pending_authority_verification'};
}
