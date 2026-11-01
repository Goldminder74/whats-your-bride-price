import {decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
import {D1WriterFence} from './d1WriterFence.mjs';
import {D1Authority} from '../scripts/authority-runtime.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const fail=()=>{throw Error('benchmark_committed_writer_unverified');};
/** Post-stop reconciliation, never a new mutation or forced unlock. Only the
 * exact already-committed, authenticated outbox event that owns the writer may
 * repeat independent commit/readback through the existing authority service. */
export async function reconcileCommittedBenchmarkWriter({db,service,key,now=Date.now}){
 const writer=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='authority-writer'"))[0];
 if(!writer||writer.state==='idle'){await new D1WriterFence(db,{now}).ready();return {alreadyIdle:true,accessReleased:false};}
 const head=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0];
 if(writer.state!=='importing'||writer.expires_at<=now()||!head||head.state!=='idle'||head.expires_at<=now())fail();
 const rows=await db.query('SELECT * FROM operational_authority_outbox WHERE sequence=?1',[head.sequence]);if(rows.length!==1)fail();
 const row=rows[0],bytes=Buffer.from(row.encrypted_event);let event;try{event=decryptRecord(bytes,key,row.operation_id+'.intent');}catch{fail();}
 const statementHash=recoveryHash(Buffer.from(JSON.stringify(event.statements)));
 if(!Array.isArray(event.statements)||!event.statements.length||event.operationId!==row.operation_id||event.sequence!==head.sequence||row.event_hash!==head.head_hash||recoveryHash(bytes)!==row.event_hash||event.intentHash!==statementHash||row.intent_hash!==statementHash||writer.manifest_hash!==statementHash||writer.head_hash!==recoveryHash(Buffer.from(row.operation_id))||event.previousHash!==row.previous_hash||event.createdAt!==row.created_at||event.expiresAt!==row.expires_at||row.expires_at-row.created_at!==RETENTION_POLICY.backupDays*RETENTION_DAY||row.created_at>now()||row.expires_at<=now())fail();
 // mutate() recognises this immutable committed operation, authenticates the
 // original independent intent, completes its commit marker and reads it back.
 // D1WriterFence then releases only its matching owner/version. Never clear SQL.
 await service.mutate(row.operation_id,event.statements);
 await new D1WriterFence(db,{now}).ready();
 const after=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0];
 if(after.sequence!==head.sequence||after.head_hash!==head.head_hash)fail();
 return {alreadyCommitted:true,independentCommitReadback:true,writerIdle:true,sameSequence:true,accessReleased:false};
}

/** An uncommitted intent may only be aborted after its authentic bytes and exact
 * writer ownership are established. No supplied SQL is executed. */
export async function abortUncommittedBenchmarkWriter({db,custody,key,intentName,now=Date.now}){
 if(!/^op_\d{13}_[a-f0-9]{32}\.intent$/.test(intentName||''))fail();
 const operationId=intentName.slice(0,-7),owner=recoveryHash(Buffer.from(operationId));
 const writer=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='authority-writer'"))[0],head=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0];
 if(!writer||!['idle','importing'].includes(writer.state)||writer.expires_at<=now()||writer.head_hash!==owner||!head||head.expires_at<=now()||!['idle','exporting'].includes(head.state))fail();
 if((await db.query('SELECT operation_id FROM operational_authority_outbox WHERE operation_id=?1',[operationId])).length)fail();
 const bytes=await custody.get(intentName);if(!bytes)fail();const event=decryptRecord(bytes,key,intentName);
 if(event.operationId!==operationId||event.sequence!==head.sequence+1||event.previousHash!==head.head_hash||event.intentHash!==recoveryHash(Buffer.from(JSON.stringify(event.statements)))||event.intentHash!==writer.manifest_hash||event.expiresAt-event.createdAt!==RETENTION_POLICY.backupDays*RETENTION_DAY||event.createdAt>now()||event.expiresAt<=now())fail();
 const id='cleanup-abort-'+owner;
 if(head.state==='exporting'&&head.manifest_hash!==id)fail();
 await new D1WriterFence(db,{now}).run(operationId,JSON.stringify(event.statements),fenced=>new D1Authority(fenced,custody,key,{now}).abortUncommitted(operationId,id));
 await new D1WriterFence(db,{now}).ready();const after=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0];
 if(after.state!=='idle'||after.sequence!==head.sequence||after.head_hash!==head.head_hash)fail();
 return {uncommittedIntentAborted:true,independentAbortReadback:true,writerIdle:true,sameSequence:true,businessMutationReplayed:false,accessReleased:false};
}
