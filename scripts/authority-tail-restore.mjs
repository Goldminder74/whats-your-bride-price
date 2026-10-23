// Offline SQLite only. No provider mutation, production binding or access grant.
// Uses existing schema and a bounded TEMP staging table, not another migration.
import {decryptRecord,recoveryHash} from './recovery-crypto.mjs';
import {assertAuthorityStatements} from './authority-runtime.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY;
const hash=value=>recoveryHash(Buffer.from(JSON.stringify(value)));
const fail=()=>{throw Error('authority_tail_restore_unavailable');};
async function read(custody,key,pointer){
 if(!pointer||typeof pointer.name!=='string'||!/^[a-f0-9]{64}$/.test(pointer.sha256||''))fail();
 const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();return decryptRecord(bytes,key,pointer.name);
}

export async function replayVerifiedAuthorityTail({database,custody,key,pointer,verification,now=Date.now,fault=()=>{}}){
 const proof=decryptRecord(Buffer.from(verification?.progress||'','base64'),key,'verify-authority:'+pointer.sha256);
 if(proof.version!==1||proof.phase!=='complete'||proof.receipt!==pointer.sha256||verification.verified!==true)fail();
 const body=await read(custody,key,pointer);
 if(body.version!==3||body.format!=='wybp-authority-boundary-v3'||body.expiresAt<=now())fail();
 const root=await read(custody,key,body.snapshotAnchor),job='offline-tail:'+pointer.sha256;
 if(root.version!==2||root.sequence!==body.base.sequence||root.head!==body.base.head||hash(root.snapshot)!==hash(body.snapshot)||root.expiresAt<body.expiresAt)fail();
 if(database.prepare('SELECT COUNT(*) n FROM retention_restore').get().n!==0)fail();
 database.exec('CREATE TEMP TABLE IF NOT EXISTS wybp_verified_tail(sequence INTEGER PRIMARY KEY,operation_id TEXT UNIQUE,event_hash TEXT,encrypted_event TEXT)');
 database.exec('DELETE FROM temp.wybp_verified_tail');
 let part=body.authority,sequence=body.sequence,head=body.head;
 const stage=database.prepare('INSERT INTO temp.wybp_verified_tail VALUES(?,?,?,?)');
 while(part){
  const segment=await read(custody,key,part);
  if(segment.format!=='wybp-authority-segment-v2'||hash(segment.base)!==hash(body.base)||hash(segment.fence)!==hash({id:body.id,sequence:body.sequence,headHash:body.head,expiresAt:body.expiresAt})||!Array.isArray(segment.rows)||!segment.rows.length||segment.rows.length>25)fail();
  for(const row of [...segment.rows].reverse()){
   const bytes=Buffer.from(row.encrypted_event),event=decryptRecord(bytes,key,row.operation_id+'.intent');
   if(row.sequence!==sequence--||row.event_hash!==head||recoveryHash(bytes)!==row.event_hash||event.sequence!==row.sequence||event.operationId!==row.operation_id||event.previousHash!==row.previous_hash||event.intentHash!==row.intent_hash||hash(event.statements)!==row.intent_hash||event.createdAt!==row.created_at||event.expiresAt!==row.expires_at||event.expiresAt-event.createdAt!==WINDOW||event.expiresAt<=now())fail();
   assertAuthorityStatements(event.statements);stage.run(row.sequence,row.operation_id,row.event_hash,row.encrypted_event);head=row.previous_hash;
  }
  part=segment.previous;
 }
 if(sequence!==body.base.sequence||head!==body.base.head)fail();
 let checkpoint=database.prepare('SELECT * FROM operational_recovery_checkpoints WHERE id=?').get(job);
 if(!checkpoint){
  if(database.prepare("SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id='journal'").get().n||database.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n)fail();
  database.exec('BEGIN');try{
   database.prepare("INSERT INTO operational_recovery_checkpoints VALUES('journal','journal',?,?,?,0,'idle',1,?,?)").run(pointer.sha256,body.base.sequence,body.base.head,body.expiresAt-WINDOW,body.expiresAt);
   database.prepare("INSERT INTO operational_recovery_checkpoints VALUES(?,'restore',?,?,?,?,'importing',1,?,?)").run(job,pointer.sha256,body.sequence,body.base.head,body.base.sequence,body.expiresAt-WINDOW,body.expiresAt);
   database.exec('COMMIT');
  }catch(error){database.exec('ROLLBACK');throw error;}
  checkpoint=database.prepare('SELECT * FROM operational_recovery_checkpoints WHERE id=?').get(job);
 }
 if(checkpoint.manifest_hash!==pointer.sha256||checkpoint.sequence!==body.sequence||checkpoint.expires_at!==body.expiresAt||checkpoint.cursor<body.base.sequence||checkpoint.cursor>body.sequence)fail();
 const journal=database.prepare("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'").get();
 if(journal?.state!=='idle'||journal.sequence!==checkpoint.cursor||journal.head_hash!==checkpoint.head_hash)fail();
 for(const row of database.prepare('SELECT * FROM temp.wybp_verified_tail WHERE sequence>? ORDER BY sequence').iterate(checkpoint.cursor)){
  const event=decryptRecord(Buffer.from(row.encrypted_event),key,row.operation_id+'.intent');
  database.exec('BEGIN');try{
   const current=database.prepare('SELECT * FROM operational_recovery_checkpoints WHERE id=?').get(job);
   if(current.cursor!==row.sequence-1||current.head_hash!==event.previousHash)fail();
   database.prepare('INSERT INTO operational_authority_outbox(sequence,operation_id,intent_hash,previous_hash,event_hash,encrypted_event,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(row.sequence,row.operation_id,event.intentHash,event.previousHash,row.event_hash,row.encrypted_event,event.createdAt,event.expiresAt);
   for(const statement of event.statements)database.prepare(statement.sql).all(...(statement.params||[]));
   database.prepare("UPDATE operational_recovery_checkpoints SET sequence=?,head_hash=?,version=version+1 WHERE id='journal'").run(row.sequence,row.event_hash);
   database.prepare('UPDATE operational_recovery_checkpoints SET cursor=?,head_hash=?,version=version+1 WHERE id=?').run(row.sequence,row.event_hash,job);
   database.exec('COMMIT');
  }catch(error){database.exec('ROLLBACK');throw error;}
  await fault('authority_tail_committed',row.sequence);
 }
 const completed=database.prepare('SELECT * FROM operational_recovery_checkpoints WHERE id=?').get(job);
 if(completed.cursor!==body.sequence||completed.head_hash!==body.head||database.prepare('PRAGMA foreign_key_check').all().length)fail();
 database.prepare("UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id=?").run(job);
 database.exec('DROP TABLE temp.wybp_verified_tail');
 return {sequence:body.sequence,head:body.head,runtimeAccess:'blocked_pending_verified_import_and_latest_authority'};
}
