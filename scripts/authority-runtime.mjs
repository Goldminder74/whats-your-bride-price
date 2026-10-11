import { encryptRecord, decryptRecord, recoveryHash } from './recovery-crypto.mjs';
import { runApprovedRetention } from '../db/retention.ts';
import { RETENTION_POLICY, RETENTION_DAY } from '../db/retentionPolicy.ts';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY, ZERO='0'.repeat(64);
const json=x=>Buffer.from(JSON.stringify(x));
const reject=code=>{throw Error(code);};
export const createOperationId=(now=Date.now())=>'op_'+now+'_'+crypto.randomUUID().replaceAll('-','');
export class D1Authority {
  constructor(db,custody,key,{now=()=>Date.now(),fault=()=>{}}={}){this.db=db;this.custody=custody;this.key=key;this.now=now;this.fault=fault;}
  async head(){return (await this.db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0];}
  async initialise(){const now=this.now();await this.db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('journal','journal',?1,0,?1,0,'idle',1,?2,?3) ON CONFLICT(id) DO NOTHING",params:[ZERO,now,now+WINDOW]}]);return this.head();}
  async mutate(operationId,statements){
    const identity=/^op_(\d{13})_[a-f0-9]{32}$/.exec(operationId),operationAt=Number(identity?.[1]);
    if(!identity||operationAt>this.now()||operationAt+WINDOW<=this.now()||!statements.length||statements.length>98)reject('authority_operation');
    if(statements.some(s=>!/^PRAGMA defer_foreign_keys=(ON|OFF)$/i.test(s.sql.trim())&&(!/^(UPDATE|INSERT|DELETE|SELECT CASE)\b/i.test(s.sql.trim())||/operational_|retention_restore|\b(ATTACH|PRAGMA)\b/i.test(s.sql))))reject('authority_sql_scope');
    if(await this.custody.get(operationId+'.abort'))reject('operation_aborted');
    if(json(statements).length>65536)reject('authority_payload_bounds');
    const intentHash=recoveryHash(json(statements));const name=operationId+'.intent';let bytes=await this.custody.get(name), event;
    if(bytes){event=decryptRecord(bytes,this.key,name);if(event.intentHash!==intentHash)reject('operation_conflict');}
    else{if(this.now()-operationAt>900000)reject('new_operation_stale');
      const head=await this.head(),now=this.now();if(!head||head.state!=='idle'||head.expires_at<=this.now())reject('journal_unavailable');
      event={operationId,intentHash,sequence:head.sequence+1,previousHash:head.head_hash,createdAt:now,expiresAt:now+WINDOW,statements};bytes=encryptRecord(event,this.key,name);await this.custody.put(name,bytes);}
    this.fault('intent_durable');if(event.expiresAt<=this.now())reject('intent_expired');
    const prior=(await this.db.query('SELECT * FROM operational_authority_outbox WHERE operation_id=?1',[operationId]))[0];
    if(prior){if(prior.intent_hash!==intentHash||prior.event_hash!==recoveryHash(bytes))reject('outbox_conflict');return prior.event_hash;}
    const hash=recoveryHash(bytes);
    await this.db.batch([{sql:'INSERT INTO operational_authority_outbox(sequence,operation_id,intent_hash,previous_hash,event_hash,encrypted_event,created_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)',params:[event.sequence,operationId,intentHash,event.previousHash,hash,bytes.toString(),event.createdAt,event.expiresAt]},...statements,{sql:"UPDATE operational_recovery_checkpoints SET sequence=?1,head_hash=?2,version=version+1 WHERE id='journal'",params:[event.sequence,hash]}]);
    this.fault('d1_committed');return hash;
  }
  async retention(operationId,at,limit=50){
    let plan;await runApprovedRetention({prepare(sql){return {bind(...params){return {sql,params};}};},async batch(statements){plan=statements;return [];}},at,limit);
    return this.mutate(operationId,plan);
  }
  async abortUncommitted(operationId,id){
    const head=await this.freeze(id),name=operationId+'.intent',bytes=await this.custody.get(name);if(!bytes)reject('intent_missing');
    if((await this.db.query('SELECT operation_id FROM operational_authority_outbox WHERE operation_id=?1',[operationId])).length)reject('committed_intent_cannot_abort');
    const event=decryptRecord(bytes,this.key,name),abortName=operationId+'.abort',prior=await this.custody.get(abortName);
    if(!prior)await this.custody.put(abortName,encryptRecord({operationId,intentHash:recoveryHash(bytes),sequence:head.sequence,head:head.head_hash,createdAt:event.createdAt,expiresAt:event.expiresAt},this.key,abortName));
    this.fault('abort_durable');
    await this.db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='idle',version=version+1 WHERE id='journal' AND state='exporting' AND manifest_hash=?1",params:[id]}]);
  }
  async freeze(id){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))reject('boundary_id');const head=await this.head();if(!head||head.expires_at<=this.now())reject('journal_expired');
    if(head.state==='exporting'&&head.manifest_hash===id)return head;
    await this.db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='exporting',manifest_hash=?1,version=version+1 WHERE id='journal' AND state='idle' AND version=?2",params:[id,head.version]}]);const fenced=await this.head();if(fenced.state!=='exporting'||fenced.manifest_hash!==id)reject('export_fence');return fenced;}
  async deliver(id,snapshot){
    const head=await this.freeze(id);this.fault('source_fenced');
    const base=(await this.db.query("SELECT sequence,head_hash FROM operational_recovery_checkpoints WHERE id='baseline'"))[0]||{sequence:0,head_hash:ZERO};
    const count=(await this.db.query('SELECT COUNT(*) n FROM operational_authority_outbox WHERE sequence>?1',[base.sequence]))[0].n, events=[];
    for(let offset=0;offset<count;offset+=100)events.push(...await this.db.query('SELECT * FROM operational_authority_outbox WHERE sequence>?1 ORDER BY sequence LIMIT 100 OFFSET ?2',[base.sequence,offset]));
    if(events.length!==count)reject('outbox_page_gap');let sequence=base.sequence,previous=base.head_hash;
    for(const event of events){if(event.sequence!==++sequence||event.previous_hash!==previous||recoveryHash(Buffer.from(event.encrypted_event))!==event.event_hash)reject('outbox_chain');
      await this.custody.put(event.operation_id+'.event',Buffer.from(event.encrypted_event));previous=event.event_hash;}
    if(sequence!==head.sequence||previous!==head.head_hash)reject('outbox_head');
    const names=await this.custody.list(),intents=[];for(const name of names.filter(n=>n.endsWith('.intent'))){if(decryptRecord(await this.custody.get(name),this.key,name).sequence>base.sequence)intents.push(name);}
    // A precommitted intent absent from this fenced source is unresolved, never silently discarded.
    for(const name of intents){const bytes=await this.custody.get(name),event=decryptRecord(bytes,this.key,name);
      if(!events.some(row=>row.operation_id===event.operationId&&row.event_hash===recoveryHash(bytes))){
        const aborted=await this.custody.get(event.operationId+'.abort');if(!aborted)reject('unresolved_intent');
        const proof=decryptRecord(aborted,this.key,event.operationId+'.abort');if(proof.intentHash!==recoveryHash(bytes))reject('abort_conflict');
      }}
    let boundary=await this.custody.get(id+'.boundary'),body;
    if(boundary){body=await readBoundary(this.custody,this.key,id,recoveryHash(boundary),this.now());
      if(body.sequence!==head.sequence||body.head!==head.head_hash)reject('boundary_source_changed');
    }else{
      const captured=await snapshot(head);this.fault('snapshot_captured');const now=this.now();
      body={...captured,version:1,id,createdAt:now,expiresAt:now+WINDOW,sequence:head.sequence,head:head.head_hash,base:{sequence:base.sequence,head:base.head_hash},intents:await Promise.all(intents.map(async name=>({name,aborted:!!await this.custody.get(name.replace('.intent','.abort'))})))};
      boundary=encryptRecord(body,this.key,id+'.boundary');await this.custody.put(id+'.boundary',boundary);
    }
    const receipt=recoveryHash(boundary);await readBoundary(this.custody,this.key,id,receipt,this.now());this.fault('independent_readback');
    for(let offset=0;offset<events.length;offset+=50){
      await this.db.batch(events.slice(offset,offset+50).map(e=>({sql:'UPDATE operational_authority_outbox SET delivery_receipt=?1,acknowledged_at=?2 WHERE operation_id=?3 AND event_hash=?4',params:[receipt,this.now(),e.operation_id,e.event_hash]})));this.fault('outbox_acknowledged');
    }
    await this.db.batch([
      {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id='journal' AND state='exporting' AND manifest_hash=?1 AND sequence=?2 AND head_hash=?3) THEN 1 ELSE json('delivery_fence_changed') END",params:[id,head.sequence,head.head_hash]},
      {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('baseline','custody',?1,?2,?3,0,'complete',1,?4,?5) ON CONFLICT(id) DO UPDATE SET manifest_hash=excluded.manifest_hash,sequence=excluded.sequence,head_hash=excluded.head_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,version=version+1",params:[receipt,head.sequence,head.head_hash,body.createdAt,body.expiresAt]},
      {sql:"UPDATE operational_recovery_checkpoints SET state='idle',created_at=?2,expires_at=?3,version=version+1 WHERE id='journal' AND state='exporting' AND manifest_hash=?1",params:[id,body.createdAt,body.expiresAt]},
    ]);
    this.fault('delivery_acknowledged');return {receipt,body};
  }
}
// Exported custody inventory pins ciphertext hashes; no row contents enter logs.
export async function custodyInventory(custody){const files=[];for(const name of await custody.list())files.push({name,sha256:recoveryHash(await custody.get(name))});return files;}
export async function readBoundary(custody,key,id,expectedReceipt,now=Date.now()){
  const bytes=await custody.get(id+'.boundary');if(!bytes||recoveryHash(bytes)!==expectedReceipt)reject('boundary_receipt');
  const b=decryptRecord(bytes,key,id+'.boundary');if(b.expiresAt<=now||b.createdAt>now)reject('boundary_expired');
  const names=[];for(const name of (await custody.list()).filter(n=>n.endsWith('.intent'))){if(decryptRecord(await custody.get(name),key,name).sequence>(b.base?.sequence||0))names.push(name);}names.sort();if(JSON.stringify(names)!==JSON.stringify(b.intents.map(x=>x.name).sort()))reject('later_or_missing_intent');
  let sequence=b.base?.sequence||0,previous=b.base?.head||ZERO;
  const ordered=[];for(const name of names){const intent=await custody.get(name),aborted=b.intents.find(x=>x.name===name)?.aborted;
    if(aborted){const abort=await custody.get(name.replace('.intent','.abort'));if(!abort||decryptRecord(abort,key,name.replace('.intent','.abort')).intentHash!==recoveryHash(intent))reject('abort_missing');continue;}
    const event=await custody.get(name.replace('.intent','.event'));if(!event||recoveryHash(intent)!==recoveryHash(event))reject('undelivered_authority');ordered.push({value:decryptRecord(intent,key,name),hash:recoveryHash(intent)});}
  ordered.sort((a,c)=>a.value.sequence-c.value.sequence);for(const event of ordered){if(event.value.sequence!==++sequence||event.value.previousHash!==previous)reject('boundary_chain');previous=event.hash;}
  if(sequence!==b.sequence||previous!==b.head)reject('boundary_head');
  if(!Array.isArray(b.files)||!b.files.length)reject('snapshot_inventory_required');
  for(const file of b.files){const data=await custody.get(file.name);if(!data||recoveryHash(data)!==file.sha256)reject('snapshot_file_gap');}
  return b;
}
